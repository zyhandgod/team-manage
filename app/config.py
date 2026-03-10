"""
应用配置模块
使用 Pydantic Settings 管理配置
"""
import hashlib
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SECRET_KEY = "your-secret-key-here-change-in-production"
DEFAULT_ADMIN_PASSWORD = "admin123"
COMMON_ADMIN_PATHS = {
    "/admin",
    "/administrator",
    "/backend",
    "/console",
    "/dashboard",
    "/manage",
    "/manager",
    "/system",
}


def normalize_path(path: str) -> str:
    """标准化 URL 路径"""
    cleaned = (path or "").strip()
    if not cleaned:
        return ""

    return f"/{cleaned.strip('/')}"


class Settings(BaseSettings):
    """应用配置"""

    # 应用配置
    app_name: str = "GPT Team 管理系统"
    app_version: str = "0.1.0"
    app_host: str = "0.0.0.0"
    app_port: int = 8008
    debug: bool = True

    # 数据库配置
    # 建议在 Docker 中使用 data 目录挂载，以避免文件挂载权限或类型问题
    database_url: str = f"sqlite+aiosqlite:///{BASE_DIR}/data/team_manage.db"

    # 安全配置
    secret_key: str = DEFAULT_SECRET_KEY
    admin_password: str = DEFAULT_ADMIN_PASSWORD
    admin_path: str = ""

    # 日志配置
    log_level: str = "INFO"
    database_echo: bool = False

    # 代理配置
    proxy: str = ""
    proxy_enabled: bool = False

    # JWT 配置
    jwt_verify_signature: bool = False

    # 时区配置
    timezone: str = "Asia/Shanghai"

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )

    @property
    def is_default_secret_key(self) -> bool:
        """是否仍在使用默认 SECRET_KEY"""
        return self.secret_key == DEFAULT_SECRET_KEY

    @property
    def is_default_admin_password(self) -> bool:
        """是否仍在使用默认管理员初始密码"""
        return self.admin_password == DEFAULT_ADMIN_PASSWORD

    @property
    def configured_admin_path(self) -> str:
        """显式配置的后台路径"""
        return normalize_path(self.admin_path)

    @property
    def admin_base_path(self) -> str:
        """后台入口路径，未显式配置时基于 SECRET_KEY 生成隐藏路径"""
        if self.configured_admin_path:
            return self.configured_admin_path

        digest = hashlib.sha256(
            f"{self.secret_key}:gpt-team-manage".encode("utf-8")
        ).hexdigest()[:18]
        return f"/console-{digest}"

    @property
    def auth_route_prefix(self) -> str:
        """后台认证接口前缀"""
        return f"{self.admin_base_path}/auth"

    @property
    def admin_login_path(self) -> str:
        """后台登录页路径"""
        return f"{self.admin_base_path}/login"

    @property
    def session_https_only(self) -> bool:
        """生产环境强制使用 Secure Cookie"""
        return not self.debug

    @property
    def uses_common_admin_path(self) -> bool:
        """后台路径是否过于常见、容易被枚举"""
        return self.admin_base_path.lower() in COMMON_ADMIN_PATHS


# 创建全局配置实例
settings = Settings()
