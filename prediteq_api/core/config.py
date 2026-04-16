import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), '..', '.env'),
        env_file_encoding='utf-8',
        extra='ignore',
    )

    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str

    MQTT_BROKER: str = "broker.emqx.io"
    MQTT_PORT: int = 8883
    MQTT_USER: str = ""
    MQTT_PASSWORD: str = ""
    MQTT_USE_SSL: bool = True

    GROQ_API_KEY: str = ""
    RESEND_API_KEY: str = ""
    RESEND_FROM: str = "PrediTeq Alerts <onboarding@resend.dev>"
    ADMIN_EMAIL: str = ""
    DASHBOARD_URL: str = "https://prediteq-saas.vercel.app"

    # CORS (comma-separated origins — set in env for production)
    CORS_ORIGINS: str = "https://prediteq-saas.vercel.app"

    # Root of prediteq_ml package (contains config.py, models/, steps/)
    ML_DIR: str = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', '..', 'prediteq_ml')
    )

    @property
    def MODEL_DIR(self) -> str:
        return os.path.join(self.ML_DIR, 'models')


settings = Settings()
