from dataclasses import dataclass

from livekit.agents import TurnHandlingOptions, room_io
from livekit.plugins import cartesia, deepgram, openai, silero

from voice_pipeline.domain.session import ClientSessionRequest


@dataclass(slots=True)
class LiveKitProviderBundle:
    stt: object
    llm: object
    tts: object
    vad: object
    turn_handling: TurnHandlingOptions
    room_options: room_io.RoomOptions


def build_provider_bundle(session_request: ClientSessionRequest) -> LiveKitProviderBundle:
    if session_request.provider_selection.stt_provider_id != "deepgram-stt":
        raise ValueError("the initial WebRTC flow supports only deepgram-stt")
    if session_request.provider_selection.llm_provider_id != "openai-responses-llm":
        raise ValueError("the initial WebRTC flow supports only openai-responses-llm")
    if session_request.provider_selection.tts_provider_id != "cartesia-tts":
        raise ValueError("the initial WebRTC flow supports only cartesia-tts")
    if session_request.provider_selection.vad_provider_id != "silero-vad":
        raise ValueError("the initial WebRTC flow supports only silero-vad")

    vad = silero.VAD.load(
        min_speech_duration=session_request.vad.min_speech_duration,
        min_silence_duration=session_request.vad.min_silence_duration,
        prefix_padding_duration=session_request.vad.prefix_padding_duration,
        max_buffered_speech=session_request.vad.max_buffered_speech,
        activation_threshold=session_request.vad.activation_threshold,
        sample_rate=session_request.vad.sample_rate,
    )
    if session_request.stt.uses_flux:
        sttv2_kwargs: dict[str, object] = {
            "model": session_request.stt.model,
            "api_key": session_request.stt.api_key.get_secret_value(),
        }
        if session_request.stt.model == "flux-general-multi":
            sttv2_kwargs["language_hint"] = [session_request.stt.language]
        if session_request.stt.eager_eot_threshold is not None:
            sttv2_kwargs["eager_eot_threshold"] = session_request.stt.eager_eot_threshold
        if session_request.stt.eot_threshold is not None:
            sttv2_kwargs["eot_threshold"] = session_request.stt.eot_threshold
        elif session_request.stt.eager_eot_threshold is not None:
            sttv2_kwargs["eot_threshold"] = max(session_request.stt.eager_eot_threshold, 0.5)
        if session_request.stt.keyterms:
            sttv2_kwargs["keyterm"] = session_request.stt.keyterms
        stt = deepgram.STTv2(**sttv2_kwargs)
        turn_handling = TurnHandlingOptions(
            turn_detection="stt",
            interruption={"mode": "vad"},
        )
    else:
        stt_kwargs: dict[str, object] = {
            "model": session_request.stt.model,
            "language": session_request.stt.language,
            "detect_language": session_request.stt.detect_language,
            "interim_results": session_request.stt.interim_results,
            "punctuate": session_request.stt.punctuate,
            "smart_format": session_request.stt.smart_format,
            "endpointing_ms": session_request.stt.endpointing_ms,
            "api_key": session_request.stt.api_key.get_secret_value(),
            "enable_diarization": session_request.stt.enable_diarization,
        }
        if session_request.stt.utterance_end_ms is not None:
            stt_kwargs["utterance_end_ms"] = session_request.stt.utterance_end_ms
        if session_request.stt.keyterms:
            stt_kwargs["keyterm"] = session_request.stt.keyterms
        stt = deepgram.STT(**stt_kwargs)
        turn_handling = TurnHandlingOptions(
            turn_detection="stt",
            interruption={"mode": "vad"},
        )

    llm = openai.responses.LLM(
        model=session_request.llm.model,
        api_key=session_request.llm.api_key.get_secret_value(),
        base_url=session_request.llm.base_url,
        temperature=session_request.llm.temperature,
        max_output_tokens=session_request.llm.max_output_tokens,
        user=session_request.llm.user,
        metadata={
            "session_id": session_request.session_id,
            "transport": session_request.transport,
        },
    )
    tts = cartesia.TTS(
        api_key=session_request.tts.api_key.get_secret_value(),
        model=session_request.tts.model,
        voice=session_request.tts.voice,
        language=session_request.tts.language,
        speed=session_request.tts.speed,
        emotion=session_request.tts.emotion,
        volume=session_request.tts.volume,
        sample_rate=session_request.tts.sample_rate,
    )
    audio_input = (
        room_io.AudioInputOptions(
            auto_gain_control=session_request.room.auto_gain_control,
            pre_connect_audio=session_request.room.pre_connect_audio,
        )
        if session_request.room.audio_input_enabled
        else False
    )
    text_output = (
        room_io.TextOutputOptions(sync_transcription=session_request.room.sync_transcription)
        if session_request.room.text_output_enabled
        else False
    )
    room_options = room_io.RoomOptions(
        participant_identity=session_request.room.participant_identity,
        close_on_disconnect=session_request.room.close_on_disconnect,
        delete_room_on_close=session_request.room.delete_room_on_close,
        text_input=session_request.room.text_input_enabled,
        audio_input=audio_input,
        audio_output=session_request.room.audio_output_enabled,
        text_output=text_output,
    )
    return LiveKitProviderBundle(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=vad,
        turn_handling=turn_handling,
        room_options=room_options,
    )
