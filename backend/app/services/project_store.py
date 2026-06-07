import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.paths import DATA_DIR
from app.models.contracts import PipelineResult


class ProjectStore:
    """Tiny SQLite-backed project/session store for real pipeline outputs."""

    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or (DATA_DIR / "videogen.sqlite3")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    project_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    status TEXT NOT NULL,
                    pipeline_json TEXT NOT NULL,
                    preview_url TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def upsert_pipeline(
        self,
        result: PipelineResult,
        *,
        stage: str = "plan",
        status: str = "ready",
        preview_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        project_id = result.edit_plan.project_id
        title = result.edit_plan.target_title
        payload = result.model_dump_json()
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT created_at, preview_url FROM projects WHERE project_id = ?",
                (project_id,),
            ).fetchone()
            conn.execute(
                """
                INSERT INTO projects (
                    project_id, title, stage, status, pipeline_json, preview_url, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id) DO UPDATE SET
                    title = excluded.title,
                    stage = excluded.stage,
                    status = excluded.status,
                    pipeline_json = excluded.pipeline_json,
                    preview_url = COALESCE(excluded.preview_url, projects.preview_url),
                    updated_at = excluded.updated_at
                """,
                (
                    project_id,
                    title,
                    stage,
                    status,
                    payload,
                    preview_url,
                    existing["created_at"] if existing else now,
                    now,
                ),
            )
        return self.get_project(project_id) or {}

    def set_preview(self, project_id: str, preview_url: str) -> Optional[Dict[str, Any]]:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                "UPDATE projects SET preview_url = ?, stage = ?, status = ?, updated_at = ? WHERE project_id = ?",
                (preview_url, "preview", "ready", now, project_id),
            )
        return self.get_project(project_id)

    def list_projects(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT project_id, title, stage, status, preview_url, created_at, updated_at
                FROM projects
                ORDER BY updated_at DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT project_id, title, stage, status, pipeline_json, preview_url, created_at, updated_at
                FROM projects WHERE project_id = ?
                """,
                (project_id,),
            ).fetchone()
        if row is None:
            return None
        data = dict(row)
        data["pipeline"] = json.loads(data.pop("pipeline_json"))
        return data
