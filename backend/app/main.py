from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.paths import OUTPUTS_DIR, PROJECT_ROOT
from app.core.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Viral Structure Migration Engine",
        version="0.1.0",
        description="Framework API for sample analysis, material understanding and edit-plan generation.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")
    public_dir = PROJECT_ROOT / "public"
    if public_dir.exists():
        app.mount("/public", StaticFiles(directory=public_dir), name="public")
    app.include_router(router)
    return app


app = create_app()
