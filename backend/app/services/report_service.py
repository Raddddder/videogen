from typing import Any, Dict

from app.models.contracts import EditPlan
from app.services.json_repository import JsonRepository


class ReportService:
    """Comparison report and editing guide generation."""

    def __init__(self, repository: JsonRepository) -> None:
        self.repository = repository

    def comparison_report(self, edit_plan: EditPlan) -> Dict[str, Any]:
        payload = self.repository.load_mock("comparison_report")
        payload["project_id"] = edit_plan.project_id
        return payload

    def editing_guide_markdown(self, edit_plan: EditPlan) -> str:
        lines = [
            f"# {edit_plan.target_title}",
            "",
            f"- 结构一致性：{edit_plan.overall_score.structure_consistency:.0%}",
            f"- 素材匹配度：{edit_plan.overall_score.material_fit:.0%}",
            f"- 节奏匹配度：{edit_plan.overall_score.pacing_fit:.0%}",
            "",
            "## 时间线",
        ]
        for item in edit_plan.timeline:
            start, end = item.target_time_range
            lines.extend(
                [
                    "",
                    f"### {item.function} [{start:.1f}s - {end:.1f}s]",
                    f"- 文案：{item.script}",
                    f"- 状态：{item.slot_status}",
                    f"- 补全策略：{item.completion_strategy}",
                    f"- 说明：{item.explanation}",
                ]
            )
        return "\n".join(lines) + "\n"
