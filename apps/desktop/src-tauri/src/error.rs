use serde::Serialize;

pub type NativeResult<T> = Result<T, NativeError>;

#[derive(Debug, thiserror::Error)]
pub enum NativeError {
    #[error("{0}")]
    Database(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    File(String),
    #[error("{0}")]
    Credential(String),
    #[error("{0}")]
    Provider(String),
    #[error("{0}")]
    Cancelled(String),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl Serialize for NativeError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Payload<'a> {
            code: &'a str,
            message: String,
        }

        let code = match self {
            NativeError::Conflict(_) => "CONFLICT",
            NativeError::File(_) | NativeError::Io(_) => "FILE_ERROR",
            NativeError::Credential(_) => "CREDENTIAL_ERROR",
            NativeError::Provider(_) => "PROVIDER_ERROR",
            NativeError::Cancelled(_) => "CANCELLED",
            _ => "DATABASE_ERROR",
        };
        Payload {
            code,
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_errors_have_a_stable_public_code() {
        let value = serde_json::to_value(NativeError::Credential("vault unavailable".into()))
            .expect("serialize native error");
        assert_eq!(value["code"], "CREDENTIAL_ERROR");
        assert_eq!(value["message"], "vault unavailable");
    }
}
