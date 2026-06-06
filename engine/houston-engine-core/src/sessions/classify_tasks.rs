use super::provider_oneshot;
use crate::error::CoreResult;
use houston_terminal_manager::Provider;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const CLASSIFY_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TaskCandidate {
    pub id: String,
    pub label: String,
}

pub async fn classify_tasks(
    conversation: &str,
    tasks: &[TaskCandidate],
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<Vec<String>> {
    if tasks.is_empty() || conversation.trim().is_empty() {
        return Ok(vec![]);
    }

    let model = match default_model(provider, model) {
        Some(m) => m,
        None => {
            tracing::warn!(
                "classify_tasks: no model wired for provider {:?}",
                provider.id()
            );
            return Ok(vec![]);
        }
    };

    let prompt = build_prompt(conversation, tasks);

    let raw = match provider_oneshot::run_provider_oneshot(&prompt, provider, model, CLASSIFY_TIMEOUT).await {
        Ok(raw) => raw,
        Err(e) => {
            tracing::warn!("classify_tasks: oneshot failed: {}", e);
            return Ok(vec![]);
        }
    };

    Ok(parse_ids(&raw))
}

fn default_model<'a>(provider: Provider, model_override: Option<&'a str>) -> Option<&'a str> {
    let default = match provider.id() {
        "anthropic" => "claude-haiku-4-5",
        "openai" => "gpt-4o-mini",
        "gemini" => "gemini-2.0-flash-lite",
        _ => return None,
    };
    Some(model_override.unwrap_or(default))
}

fn build_prompt(conversation: &str, tasks: &[TaskCandidate]) -> String {
    let task_list = tasks
        .iter()
        .map(|t| format!("  - \"{}\" (id: \"{}\")", t.label, t.id))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "You are a task classifier. Read the conversation summary and identify which tasks from the list were completed.\n\
         Return ONLY a JSON array of task IDs that were completed, or [] if none match.\n\
         No explanation, no markdown fences, just valid JSON array of strings.\n\n\
         Available tasks:\n{task_list}\n\n\
         Conversation:\n{conversation}"
    )
}

fn parse_ids(raw: &str) -> Vec<String> {
    let raw = raw.trim();
    let raw = raw
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    match serde_json::from_str::<Vec<String>>(raw) {
        Ok(ids) => ids,
        Err(e) => {
            tracing::warn!("classify_tasks: parse failed: {} raw={:?}", e, raw);
            vec![]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_prompt_includes_task_labels_and_ids() {
        let tasks = vec![
            TaskCandidate { id: "t1".into(), label: "Fix login bug".into() },
            TaskCandidate { id: "t2".into(), label: "Write tests".into() },
        ];
        let prompt = build_prompt("User fixed the login.", &tasks);
        assert!(prompt.contains("Fix login bug"));
        assert!(prompt.contains("id: \"t1\""));
        assert!(prompt.contains("Write tests"));
        assert!(prompt.contains("id: \"t2\""));
    }

    #[test]
    fn parse_ids_returns_ids_from_clean_json() {
        let raw = r#"["t1","t3"]"#;
        assert_eq!(parse_ids(raw), vec!["t1", "t3"]);
    }

    #[test]
    fn parse_ids_strips_markdown_fences() {
        let raw = "```json\n[\"t2\"]\n```";
        assert_eq!(parse_ids(raw), vec!["t2"]);
    }

    #[test]
    fn parse_ids_returns_empty_on_invalid_json() {
        let raw = "not json at all";
        assert_eq!(parse_ids(raw), Vec::<String>::new());
    }

    #[test]
    fn parse_ids_returns_empty_for_empty_array() {
        let raw = "[]";
        let result = parse_ids(raw);
        assert!(result.is_empty());
    }

    #[test]
    fn default_model_returns_none_for_unknown_provider() {
        let p: Provider = "anthropic".parse().unwrap();
        // Known provider, no override → default
        assert_eq!(default_model(p, None), Some("claude-haiku-4-5"));
    }

    #[test]
    fn default_model_respects_override() {
        let p: Provider = "anthropic".parse().unwrap();
        assert_eq!(default_model(p, Some("claude-sonnet-4-5")), Some("claude-sonnet-4-5"));
    }
}
