use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use std::collections::HashMap;
use std::time::Duration;
use tauri::{ipc::Channel, State};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::credentials::openrouter_key;
use crate::error::{NativeError, NativeResult};

const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

#[derive(Default)]
pub struct AiState {
    operations: Mutex<HashMap<String, CancellationToken>>,
}

impl AiState {
    async fn register(&self, operation_id: String, token: CancellationToken) {
        self.operations.lock().await.insert(operation_id, token);
    }

    async fn cancel(&self, operation_id: &str) {
        if let Some(token) = self.operations.lock().await.remove(operation_id) {
            token.cancel();
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamRequest {
    operation_id: String,
    model: String,
    messages: Vec<JsonValue>,
    max_tokens: Option<u64>,
    temperature: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamEvent {
    Delta { delta: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamCompletion {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
}

fn client() -> NativeResult<Client> {
    Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60 * 10))
        .user_agent("Skriv/0.1")
        .build()
        .map_err(|error| NativeError::Provider(error.to_string()))
}

fn consume_sse_line(
    line: &str,
    channel: &Channel<StreamEvent>,
    input_tokens: &mut Option<u64>,
    output_tokens: &mut Option<u64>,
) -> NativeResult<bool> {
    let Some(data) = line.strip_prefix("data:").map(str::trim) else {
        return Ok(true);
    };
    if data.is_empty() || data == "[DONE]" {
        return Ok(false);
    }
    let payload: JsonValue = serde_json::from_str(data).map_err(|error| {
        NativeError::Provider(format!("Invalid OpenRouter stream event: {error}"))
    })?;
    if let Some(message) = payload
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(JsonValue::as_str)
    {
        return Err(NativeError::Provider(message.to_owned()));
    }
    if let Some(delta) = payload
        .pointer("/choices/0/delta/content")
        .and_then(JsonValue::as_str)
        .filter(|value| !value.is_empty())
    {
        channel
            .send(StreamEvent::Delta {
                delta: delta.to_owned(),
            })
            .map_err(|error| NativeError::Provider(error.to_string()))?;
    }
    if let Some(usage) = payload.get("usage") {
        *input_tokens = usage.get("prompt_tokens").and_then(JsonValue::as_u64);
        *output_tokens = usage.get("completion_tokens").and_then(JsonValue::as_u64);
    }
    Ok(true)
}

#[tauri::command]
pub async fn openrouter_stream(
    state: State<'_, AiState>,
    request: StreamRequest,
    on_event: Channel<StreamEvent>,
) -> NativeResult<StreamCompletion> {
    if request.operation_id.trim().is_empty() || request.model.trim().is_empty() {
        return Err(NativeError::Provider(
            "An operation id and model are required.".into(),
        ));
    }
    let key = openrouter_key()?.ok_or_else(|| {
        NativeError::Credential("Configure an OpenRouter key in Settings before using AI.".into())
    })?;
    let http = client()?;
    let cancellation = CancellationToken::new();
    state
        .register(request.operation_id.clone(), cancellation.clone())
        .await;

    let payload = json!({
        "model": request.model,
        "messages": request.messages,
        "stream": true,
        "stream_options": { "include_usage": true },
        "max_tokens": request.max_tokens,
        "temperature": request.temperature.unwrap_or(0.7),
    });
    let response = http
        .post(OPENROUTER_CHAT_URL)
        .bearer_auth(key)
        .header("HTTP-Referer", "https://skriv.local")
        .header("X-Title", "Skriv")
        .json(&payload)
        .send()
        .await;
    let response = match response {
        Ok(response) => response,
        Err(error) => {
            state.operations.lock().await.remove(&request.operation_id);
            return Err(NativeError::Provider(error.to_string()));
        }
    };
    if !response.status().is_success() {
        let status = response.status();
        let message = response.text().await.unwrap_or_default();
        state.operations.lock().await.remove(&request.operation_id);
        return Err(NativeError::Provider(format!(
            "OpenRouter request failed ({status}): {}",
            if message.is_empty() {
                "No response body"
            } else {
                &message
            }
        )));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut input_tokens = None;
    let mut output_tokens = None;
    let stream_result: NativeResult<()> = async {
        'stream: loop {
            tokio::select! {
                () = cancellation.cancelled() => {
                    return Err(NativeError::Cancelled("AI operation cancelled.".into()));
                }
                item = tokio::time::timeout(Duration::from_secs(60), stream.next()) => {
                    let Ok(item) = item else { break 'stream; }; // Handle timeout
                    let Some(item) = item else { break 'stream; };
                    let bytes = item.map_err(|error| NativeError::Provider(error.to_string()))?;
                    buffer.push_str(&String::from_utf8_lossy(&bytes));
                    while let Some(newline) = buffer.find('\n') {
                        let line = buffer[..newline].trim_end_matches('\r').to_owned();
                        buffer.drain(..=newline);
                        if !consume_sse_line(&line, &on_event, &mut input_tokens, &mut output_tokens)? {
                            break 'stream;
                        }
                    }
                    if buffer.trim() == "data: [DONE]" {
                        break 'stream;
                    }
                }
            }
        }
        if !buffer.trim().is_empty() {
            let _ = consume_sse_line(
                buffer.trim(),
                &on_event,
                &mut input_tokens,
                &mut output_tokens,
            )?;
        }
        Ok(())
    }
    .await;
    state.operations.lock().await.remove(&request.operation_id);
    stream_result?;
    Ok(StreamCompletion {
        input_tokens,
        output_tokens,
    })
}

#[tauri::command]
pub async fn cancel_ai_operation(
    state: State<'_, AiState>,
    operation_id: String,
) -> NativeResult<()> {
    state.cancel(&operation_id).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cancelling_an_operation_triggers_its_token_and_removes_it() {
        let state = AiState::default();
        let token = CancellationToken::new();
        state.register("generation-1".into(), token.clone()).await;
        state.cancel("generation-1").await;
        assert!(token.is_cancelled());
        assert!(state.operations.lock().await.is_empty());
    }
}
