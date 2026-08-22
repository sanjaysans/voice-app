from voice_pipeline.domain.models import PipelineMode, ProviderCapability, ProviderKind


def default_provider_registry() -> dict[str, ProviderCapability]:
    return {
        "deepgram-stt": ProviderCapability(
            provider_id="deepgram-stt",
            provider_kind=ProviderKind.STT,
            label="Deepgram Streaming STT",
            supported_modes=[
                PipelineMode.STT_LLM_TTS,
                PipelineMode.STT_REALTIME,
            ],
            supports_streaming_input=True,
            supports_streaming_output=False,
            supports_partial_transcripts=True,
            supports_server_vad=True,
            supports_interruption_recovery=True,
            supported_modalities=["audio", "text"],
        ),
        "openai-responses-llm": ProviderCapability(
            provider_id="openai-responses-llm",
            provider_kind=ProviderKind.LLM,
            label="OpenAI Responses LLM",
            supported_modes=[
                PipelineMode.STT_LLM_TTS,
                PipelineMode.TEXT_LLM_TTS,
            ],
            supports_streaming_input=True,
            supports_streaming_output=True,
            supported_modalities=["text"],
        ),
        "cartesia-tts": ProviderCapability(
            provider_id="cartesia-tts",
            provider_kind=ProviderKind.TTS,
            label="Cartesia Streaming TTS",
            supported_modes=[
                PipelineMode.STT_LLM_TTS,
                PipelineMode.TEXT_LLM_TTS,
            ],
            supports_streaming_input=True,
            supports_streaming_output=True,
            supports_interruption_recovery=True,
            supported_modalities=["text", "audio"],
        ),
        "openai-realtime": ProviderCapability(
            provider_id="openai-realtime",
            provider_kind=ProviderKind.REALTIME,
            label="OpenAI Realtime",
            supported_modes=[
                PipelineMode.REALTIME_S2S,
                PipelineMode.STT_REALTIME,
            ],
            supports_streaming_input=True,
            supports_streaming_output=True,
            supports_partial_transcripts=True,
            supports_server_vad=True,
            supports_interruption_recovery=True,
            supported_modalities=["audio", "text"],
        ),
        "silero-vad": ProviderCapability(
            provider_id="silero-vad",
            provider_kind=ProviderKind.VAD,
            label="Silero VAD",
            supported_modes=[mode for mode in PipelineMode],
            supports_streaming_input=True,
            supports_streaming_output=False,
            supported_modalities=["audio"],
        ),
    }
