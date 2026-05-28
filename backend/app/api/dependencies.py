from app.application.pipeline import DemoPipeline
from app.core.settings import get_settings
from app.services.json_repository import JsonRepository
from app.services.asr_service import AsrService
from app.services.material_analyzer import MaterialAnalyzer
from app.services.media_probe import MediaProbe
from app.services.plan_generator import PlanGenerator
from app.services.report_service import ReportService
from app.services.structure_analyzer import StructureAnalyzer
from app.services.structure_role_classifier import StructureRoleClassifier


def build_repository() -> JsonRepository:
    return JsonRepository(get_settings().config)


def build_structure_analyzer() -> StructureAnalyzer:
    settings = get_settings()
    media_probe = build_media_probe()
    return StructureAnalyzer(
        build_repository(),
        media_probe,
        AsrService(
            provider=settings.asr_provider,
            api_key=settings.asr_api_key,
            base_url=settings.asr_base_url,
            model=settings.asr_model,
            timeout_sec=settings.asr_timeout_sec,
            audio_max_bytes=settings.asr_audio_max_bytes,
            public_base_url=settings.asr_public_base_url,
            language_hints=settings.asr_language_hints,
            poll_interval_sec=settings.asr_poll_interval_sec,
            media_probe=media_probe,
        ),
        build_structure_role_classifier(),
    )


def build_material_analyzer() -> MaterialAnalyzer:
    return MaterialAnalyzer(build_repository())


def build_plan_generator() -> PlanGenerator:
    return PlanGenerator(build_repository())


def build_report_service() -> ReportService:
    return ReportService(build_repository())


def build_demo_pipeline() -> DemoPipeline:
    repository = build_repository()
    settings = get_settings()
    media_probe = build_media_probe()
    return DemoPipeline(
        structure_analyzer=StructureAnalyzer(
            repository,
            media_probe,
            AsrService(
                provider=settings.asr_provider,
                api_key=settings.asr_api_key,
                base_url=settings.asr_base_url,
                model=settings.asr_model,
                timeout_sec=settings.asr_timeout_sec,
                audio_max_bytes=settings.asr_audio_max_bytes,
                public_base_url=settings.asr_public_base_url,
                language_hints=settings.asr_language_hints,
                poll_interval_sec=settings.asr_poll_interval_sec,
                media_probe=media_probe,
            ),
            build_structure_role_classifier(),
        ),
        material_analyzer=MaterialAnalyzer(repository),
        plan_generator=PlanGenerator(repository),
        report_service=ReportService(repository),
    )


def build_structure_role_classifier() -> StructureRoleClassifier:
    settings = get_settings()
    return StructureRoleClassifier(
        provider=settings.llm_provider,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        model=settings.llm_model,
        timeout_sec=settings.llm_timeout_sec,
    )


def build_media_probe() -> MediaProbe:
    settings = get_settings()
    return MediaProbe(
        ffmpeg_bin=settings.ffmpeg_bin,
        ffprobe_bin=settings.ffprobe_bin,
        probe_timeout_sec=settings.media_probe_timeout_sec,
        cover_timeout_sec=settings.media_cover_timeout_sec,
        scene_threshold=settings.scene_threshold,
        min_scene_gap_sec=settings.min_scene_gap_sec,
        max_scene_cuts=settings.max_scene_cuts,
    )
