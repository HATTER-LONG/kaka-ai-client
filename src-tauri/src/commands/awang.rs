use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const DEFAULT_AWANG_BASE_URL: &str = "https://api.mcorgai.com";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AwangUsageRow {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub route: Option<String>,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub status_code: Option<i64>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub total_tokens: Option<f64>,
    #[serde(default)]
    pub remaining_balance_tokens: Option<f64>,
    #[serde(default)]
    pub account_remaining_tokens: Option<f64>,
    #[serde(default)]
    pub weekly_used_tokens: Option<f64>,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AwangUserProfile {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub login_name: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub balance_tokens: Option<f64>,
    #[serde(default)]
    pub total_recharged_tokens: Option<f64>,
    #[serde(default)]
    pub total_used_tokens: Option<f64>,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub weekly_limit_tokens: Option<f64>,
    #[serde(default)]
    pub manual_weekly_limit_tokens: Option<f64>,
    #[serde(default)]
    pub account_quota_tokens: Option<f64>,
    #[serde(default)]
    pub account_weekly_quota_tokens: Option<f64>,
    #[serde(default)]
    pub weekly_used_tokens: Option<f64>,
    #[serde(default)]
    pub weekly_remaining_tokens: Option<f64>,
    #[serde(default)]
    pub week_starts_at: Option<String>,
    #[serde(default)]
    pub account_remaining_tokens: Option<f64>,
    #[serde(default)]
    pub total_available_tokens: Option<f64>,
    #[serde(default)]
    pub account_bindings: Option<Value>,
    #[serde(default)]
    pub refresh: Option<Value>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AwangAuthPayload {
    #[serde(default)]
    pub user: AwangUserProfile,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub public_base_url: Option<String>,
    #[serde(default)]
    pub api_base_url: Option<String>,
    #[serde(default)]
    pub models: Option<Value>,
    #[serde(default)]
    pub models_error: Option<String>,
    #[serde(default)]
    pub usage: Option<Vec<AwangUsageRow>>,
    #[serde(default)]
    pub minimum_tokens_to_start_request: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AwangPublicSettings {
    #[serde(default)]
    pub turnstile_enabled: bool,
    #[serde(default)]
    pub turnstile_site_key: Option<String>,
    #[serde(default)]
    pub site_name: Option<String>,
}

fn normalize_base_url(base_url: Option<String>) -> Result<String, String> {
    let value = base_url
        .as_deref()
        .unwrap_or(DEFAULT_AWANG_BASE_URL)
        .trim()
        .trim_end_matches('/')
        .to_string();

    if value.is_empty() {
        return Err("卡卡AI base URL is empty".to_string());
    }

    let parsed = url::Url::parse(&value).map_err(|e| format!("Invalid 卡卡AI base URL: {e}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("卡卡AI base URL must use http or https".to_string());
    }

    Ok(value)
}

fn default_api_base_url(public_base_url: &str) -> String {
    let trimmed = public_base_url.trim_end_matches('/');
    if trimmed.ends_with("/v1") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/v1")
    }
}

fn api_url(base_url: &str, path: &str) -> String {
    format!("{}/api/v1{}", base_url.trim_end_matches('/'), path)
}

fn unwrap_api_data(value: Value) -> Result<Value, String> {
    if let Some(code) = value.get("code").and_then(Value::as_i64) {
        if code == 0 {
            return Ok(value.get("data").cloned().unwrap_or(Value::Null));
        }

        let message = value
            .get("message")
            .and_then(Value::as_str)
            .or_else(|| value.get("error").and_then(Value::as_str))
            .unwrap_or("Unknown API error");
        return Err(message.to_string());
    }

    Ok(value)
}

async fn parse_json_response(response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read 卡卡AI response: {e}"))?;

    if !status.is_success() {
        return Err(response_error(status, &body));
    }

    let value = serde_json::from_str::<Value>(&body)
        .map_err(|e| format!("Failed to parse 卡卡AI response: {e}"))?;
    unwrap_api_data(value)
}

fn str_field<'a>(value: &'a Value, names: &[&str]) -> Option<&'a str> {
    names
        .iter()
        .find_map(|name| value.get(*name).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn num_field(value: &Value, names: &[&str]) -> Option<f64> {
    names.iter().find_map(|name| {
        value
            .get(*name)
            .and_then(|v| v.as_f64().or_else(|| v.as_i64().map(|n| n as f64)))
    })
}

fn int_field(value: &Value, names: &[&str]) -> Option<i64> {
    names.iter().find_map(|name| {
        value.get(*name).and_then(|v| {
            v.as_i64().or_else(|| {
                v.as_u64()
                    .and_then(|n| i64::try_from(n).ok())
                    .or_else(|| v.as_str().and_then(|s| s.trim().parse::<i64>().ok()))
            })
        })
    })
}

fn merge_user_value(target: &mut AwangUserProfile, value: &Value) {
    if target.id.is_none() {
        target.id = str_field(value, &["id"]).map(ToString::to_string);
    }
    if target.name.is_none() {
        target.name =
            str_field(value, &["name", "display_name", "username"]).map(ToString::to_string);
    }
    if target.login_name.is_none() {
        target.login_name = str_field(value, &["loginName", "login_name", "email", "username"])
            .map(ToString::to_string);
    }
    if target.status.is_none() {
        target.status = str_field(value, &["status"]).map(ToString::to_string);
    }
    if target.balance_tokens.is_none() {
        target.balance_tokens = num_field(value, &["balance_tokens", "balance", "quota"]);
    }
    if target.total_recharged_tokens.is_none() {
        target.total_recharged_tokens =
            num_field(value, &["total_recharged_tokens", "total_recharged"]);
    }
    if target.total_used_tokens.is_none() {
        target.total_used_tokens = num_field(value, &["total_used_tokens", "quota_used", "used"]);
    }
    if target.weekly_remaining_tokens.is_none() {
        target.weekly_remaining_tokens =
            num_field(value, &["weekly_remaining_tokens", "weekly_remaining"]);
    }
    if target.account_remaining_tokens.is_none() {
        target.account_remaining_tokens =
            num_field(value, &["account_remaining_tokens", "remaining"]);
    }
    if target.total_available_tokens.is_none() {
        target.total_available_tokens =
            num_field(value, &["total_available_tokens", "available", "balance"]);
    }
}

fn key_from_value(value: &Value) -> Option<String> {
    str_field(value, &["key", "api_key", "apiKey", "token", "value"])
        .map(ToString::to_string)
        .filter(|key| !key.contains('*'))
}

fn group_id_from_value(value: &Value) -> Option<i64> {
    int_field(value, &["id", "group_id", "groupId"]).filter(|id| *id > 0)
}

fn collect_key_items(value: &Value) -> Vec<Value> {
    if let Some(items) = value.as_array() {
        return items.clone();
    }

    for name in ["items", "list", "records", "data"] {
        if let Some(items) = value.get(name).and_then(Value::as_array) {
            return items.clone();
        }
    }

    Vec::new()
}

async fn get_default_group_id(
    client: &reqwest::Client,
    base_url: &str,
    access_token: &str,
) -> Option<i64> {
    let groups = request_with_token(client, base_url, "/groups/available", access_token)
        .await
        .ok()?;

    collect_key_items(&groups)
        .into_iter()
        .find_map(|item| group_id_from_value(&item))
}

async fn request_with_token(
    client: &reqwest::Client,
    base_url: &str,
    path: &str,
    access_token: &str,
) -> Result<Value, String> {
    let response = client
        .get(api_url(base_url, path))
        .header("Accept", "application/json")
        .bearer_auth(access_token)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to 卡卡AI: {e}"))?;

    parse_json_response(response).await
}

async fn get_or_create_api_key(
    client: &reqwest::Client,
    base_url: &str,
    access_token: &str,
) -> Result<String, String> {
    let keys =
        request_with_token(client, base_url, "/keys?page=1&page_size=50", access_token).await?;
    for item in collect_key_items(&keys) {
        let status = str_field(&item, &["status"]).unwrap_or("active");
        if status == "active" {
            if let Some(key) = key_from_value(&item) {
                return Ok(key);
            }
        }
    }

    let default_group_id = get_default_group_id(client, base_url, access_token).await;
    let mut body = serde_json::json!({
        "name": "卡卡AI客户端",
    });
    if let Some(group_id) = default_group_id {
        body["group_id"] = Value::from(group_id);
    }

    let response = client
        .post(api_url(base_url, "/keys"))
        .header("Accept", "application/json")
        .bearer_auth(access_token)
        .timeout(Duration::from_secs(30))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to create 卡卡AI API key: {e}"))?;

    let created = parse_json_response(response).await?;
    key_from_value(&created).ok_or_else(|| "卡卡AI did not return a usable API key".to_string())
}

fn collect_model_items(value: &Value) -> Vec<Value> {
    if let Some(items) = value.as_array() {
        return items.clone();
    }

    for name in ["data", "models", "items", "list"] {
        if let Some(items) = value.get(name).and_then(Value::as_array) {
            return items.clone();
        }
    }

    if let Some(data) = value.get("data") {
        for name in ["models", "items", "list"] {
            if let Some(items) = data.get(name).and_then(Value::as_array) {
                return items.clone();
            }
        }
    }

    Vec::new()
}

async fn fetch_available_models(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
) -> Result<Value, String> {
    let response = client
        .get(format!("{}/models", default_api_base_url(base_url)))
        .header("Accept", "application/json")
        .bearer_auth(api_key)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to 璧锋簮AI models API: {e}"))?;

    let value = parse_json_response(response).await?;
    let items = collect_model_items(&value);
    if items.is_empty() {
        return Err("璧锋簮AI models API did not return available models".to_string());
    }

    Ok(Value::Array(items))
}

fn normalize_payload(
    mut payload: AwangAuthPayload,
    base_url: &str,
) -> Result<AwangAuthPayload, String> {
    if payload.api_key.as_deref().unwrap_or("").trim().is_empty() {
        payload.api_key = payload.user.api_key.clone();
    }

    let api_key = payload
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "卡卡AI did not return an API key".to_string())?
        .to_string();
    payload.api_key = Some(api_key.clone());
    payload.user.api_key = Some(api_key);

    if payload
        .public_base_url
        .as_deref()
        .unwrap_or("")
        .trim()
        .is_empty()
    {
        payload.public_base_url = Some(base_url.to_string());
    }

    if payload
        .api_base_url
        .as_deref()
        .unwrap_or("")
        .trim()
        .is_empty()
    {
        let public_base_url = payload.public_base_url.as_deref().unwrap_or(base_url);
        payload.api_base_url = Some(default_api_base_url(public_base_url));
    }

    Ok(payload)
}

fn response_error(status: reqwest::StatusCode, body: &str) -> String {
    let parsed: Result<Value, _> = serde_json::from_str(body);
    if let Ok(value) = parsed {
        if let Some(message) = value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .or_else(|| value.get("message").and_then(Value::as_str))
            .or_else(|| value.get("error").and_then(Value::as_str))
        {
            return format!("卡卡AI request failed (HTTP {status}): {message}");
        }
    }

    if body.trim().is_empty() {
        format!("卡卡AI request failed (HTTP {status})")
    } else {
        format!("卡卡AI request failed (HTTP {status}): {body}")
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn awang_login(
    base_url: Option<String>,
    username: String,
    password: String,
    turnstile_token: Option<String>,
) -> Result<AwangAuthPayload, String> {
    let base_url = normalize_base_url(base_url)?;
    let username = username.trim();
    if username.is_empty() {
        return Err("卡卡AI email is empty".to_string());
    }
    if password.is_empty() {
        return Err("卡卡AI password is empty".to_string());
    }

    let client = crate::proxy::http_client::get();
    let mut login_body = serde_json::json!({
        "email": username,
        "password": password,
    });
    if let Some(token) = turnstile_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        login_body["turnstile_token"] = Value::String(token.to_string());
    }

    let response = client
        .post(api_url(&base_url, "/auth/login"))
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(30))
        .json(&login_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to 卡卡AI: {e}"))?;

    let login = parse_json_response(response).await?;
    let access_token = str_field(&login, &["access_token", "accessToken", "token"])
        .ok_or_else(|| "卡卡AI login response did not include access_token".to_string())?
        .to_string();
    let refresh_token =
        str_field(&login, &["refresh_token", "refreshToken"]).map(ToString::to_string);

    let mut user = AwangUserProfile::default();
    if let Some(login_user) = login.get("user") {
        merge_user_value(&mut user, login_user);
    }

    if let Ok(auth_me) = request_with_token(&client, &base_url, "/auth/me", &access_token).await {
        merge_user_value(&mut user, &auth_me);
        if let Some(me_user) = auth_me.get("user") {
            merge_user_value(&mut user, me_user);
        }
    }

    if let Ok(profile) =
        request_with_token(&client, &base_url, "/user/profile", &access_token).await
    {
        merge_user_value(&mut user, &profile);
    }

    let api_key = get_or_create_api_key(&client, &base_url, &access_token).await?;
    let (models, models_error) = match fetch_available_models(&client, &base_url, &api_key).await {
        Ok(models) => (Some(models), None),
        Err(error) => (None, Some(error)),
    };

    normalize_payload(
        AwangAuthPayload {
            user,
            api_key: Some(api_key),
            access_token: Some(access_token),
            refresh_token,
            public_base_url: Some(base_url.clone()),
            api_base_url: Some(default_api_base_url(&base_url)),
            models,
            models_error,
            usage: None,
            minimum_tokens_to_start_request: None,
        },
        &base_url,
    )
}

#[tauri::command(rename_all = "camelCase")]
pub async fn awang_get_public_settings(
    base_url: Option<String>,
) -> Result<AwangPublicSettings, String> {
    let base_url = normalize_base_url(base_url)?;
    let client = crate::proxy::http_client::get();
    let response = client
        .get(api_url(&base_url, "/settings/public"))
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to 卡卡AI: {e}"))?;

    let value = parse_json_response(response).await?;
    Ok(AwangPublicSettings {
        turnstile_enabled: value
            .get("turnstile_enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        turnstile_site_key: str_field(&value, &["turnstile_site_key"]).map(ToString::to_string),
        site_name: str_field(&value, &["site_name"]).map(ToString::to_string),
    })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn awang_get_account(
    base_url: Option<String>,
    api_key: String,
) -> Result<AwangAuthPayload, String> {
    let base_url = normalize_base_url(base_url)?;
    let access_token = api_key.trim();
    if access_token.is_empty() {
        return Err("卡卡AI login token is empty".to_string());
    }

    let client = crate::proxy::http_client::get();
    let mut user = AwangUserProfile::default();

    if let Ok(auth_me) = request_with_token(&client, &base_url, "/auth/me", access_token).await {
        merge_user_value(&mut user, &auth_me);
        if let Some(me_user) = auth_me.get("user") {
            merge_user_value(&mut user, me_user);
        }
    }

    if let Ok(profile) = request_with_token(&client, &base_url, "/user/profile", access_token).await
    {
        merge_user_value(&mut user, &profile);
    }

    let relay_key = get_or_create_api_key(&client, &base_url, access_token).await?;
    let (models, models_error) = match fetch_available_models(&client, &base_url, &relay_key).await
    {
        Ok(models) => (Some(models), None),
        Err(error) => (None, Some(error)),
    };

    normalize_payload(
        AwangAuthPayload {
            user,
            api_key: Some(relay_key),
            access_token: Some(access_token.to_string()),
            refresh_token: None,
            public_base_url: Some(base_url.clone()),
            api_base_url: Some(default_api_base_url(&base_url)),
            models,
            models_error,
            usage: None,
            minimum_tokens_to_start_request: None,
        },
        &base_url,
    )
}

#[tauri::command(rename_all = "camelCase")]
pub async fn awang_redeem(
    base_url: Option<String>,
    code: String,
    access_token: String,
) -> Result<AwangAuthPayload, String> {
    let base_url = normalize_base_url(base_url)?;
    let code = code.trim();
    let access_token = access_token.trim();
    if code.is_empty() {
        return Err("兑换码不能为空".to_string());
    }
    if access_token.is_empty() {
        return Err("卡卡AI登录已失效，请重新登录".to_string());
    }

    let client = crate::proxy::http_client::get();
    let response = client
        .post(api_url(&base_url, "/redeem"))
        .header("Accept", "application/json")
        .bearer_auth(access_token)
        .timeout(Duration::from_secs(30))
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to 卡卡AI: {e}"))?;

    parse_json_response(response).await?;
    awang_get_account(Some(base_url), access_token.to_string()).await
}
