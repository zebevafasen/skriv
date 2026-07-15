use keyring::{Entry, Error as KeyringError};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::error::{NativeError, NativeResult};

const SERVICE: &str = "com.zebevafasen.skriv";
const OPENROUTER_ACCOUNT: &str = "openrouter-api-key";
const OPENROUTER_BASE_URL: &str = "https://openrouter.ai/api/v1";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStatus {
    configured: bool,
    source: &'static str,
    last_four: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCredentialRequest {
    api_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDescriptor {
    id: String,
    name: String,
    context_length: u64,
    max_completion_tokens: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModels {
    data: Vec<OpenRouterModel>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModel {
    id: String,
    name: String,
    #[serde(default)]
    context_length: u64,
    top_provider: Option<OpenRouterTopProvider>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterTopProvider {
    max_completion_tokens: Option<u64>,
}

fn entry() -> NativeResult<Entry> {
    Entry::new(SERVICE, OPENROUTER_ACCOUNT)
        .map_err(|error| NativeError::Credential(error.to_string()))
}

pub fn openrouter_key() -> NativeResult<Option<String>> {
    match entry()?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(NativeError::Credential(error.to_string())),
    }
}

fn status_for(secret: Option<&str>) -> CredentialStatus {
    CredentialStatus {
        configured: secret.is_some(),
        source: if secret.is_some() { "keychain" } else { "none" },
        last_four: secret.map(|value| {
            value
                .chars()
                .rev()
                .take(4)
                .collect::<String>()
                .chars()
                .rev()
                .collect()
        }),
    }
}

fn client() -> NativeResult<Client> {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("Skriv/0.1")
        .build()
        .map_err(|error| NativeError::Provider(error.to_string()))
}

#[tauri::command]
pub async fn credential_status() -> NativeResult<CredentialStatus> {
    let secret = openrouter_key()?;
    Ok(status_for(secret.as_deref()))
}

#[tauri::command]
pub async fn save_openrouter_credential(
    request: SaveCredentialRequest,
) -> NativeResult<CredentialStatus> {
    let secret = request.api_key.trim();
    if secret.len() < 10 || secret.len() > 500 {
        return Err(NativeError::Credential(
            "The OpenRouter key has an invalid length.".into(),
        ));
    }
    let response = client()?
        .get(format!("{OPENROUTER_BASE_URL}/key"))
        .bearer_auth(secret)
        .send()
        .await
        .map_err(|error| NativeError::Provider(error.to_string()))?;
    if !response.status().is_success() {
        return Err(NativeError::Credential(
            if response.status().as_u16() == 401 {
                "OpenRouter rejected this API key. Check the key and try again.".into()
            } else {
                format!("OpenRouter key validation failed ({}).", response.status())
            },
        ));
    }
    entry()?
        .set_password(secret)
        .map_err(|error| NativeError::Credential(error.to_string()))?;
    Ok(status_for(Some(secret)))
}

#[tauri::command]
pub async fn delete_openrouter_credential() -> NativeResult<()> {
    match entry()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(NativeError::Credential(error.to_string())),
    }
}

#[tauri::command]
pub async fn list_models() -> NativeResult<Vec<ModelDescriptor>> {
    let secret = openrouter_key()?.ok_or_else(|| {
        NativeError::Credential("Configure an OpenRouter key before loading models.".into())
    })?;
    let response = client()?
        .get(format!("{OPENROUTER_BASE_URL}/models"))
        .bearer_auth(secret)
        .send()
        .await
        .map_err(|error| NativeError::Provider(error.to_string()))?;
    if !response.status().is_success() {
        return Err(NativeError::Provider(format!(
            "OpenRouter model discovery failed ({}).",
            response.status()
        )));
    }
    let payload = response
        .json::<OpenRouterModels>()
        .await
        .map_err(|error| NativeError::Provider(error.to_string()))?;
    let mut models = payload
        .data
        .into_iter()
        .map(|model| ModelDescriptor {
            id: model.id,
            name: model.name,
            context_length: model.context_length,
            max_completion_tokens: model
                .top_provider
                .and_then(|item| item.max_completion_tokens),
        })
        .collect::<Vec<_>>();
    models.sort_by_key(|model| model.name.to_lowercase());
    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_never_exposes_the_saved_secret() {
        let status = status_for(Some("sk-or-secret-12345678"));
        assert!(status.configured);
        assert_eq!(status.source, "keychain");
        assert_eq!(status.last_four.as_deref(), Some("5678"));
        let encoded = serde_json::to_string(&status).expect("serialize status");
        assert!(!encoded.contains("secret"));
    }
}
