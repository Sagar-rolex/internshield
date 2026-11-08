"""Backend environment loading shared by the API and direct service imports."""
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def load_backend_environment(project_root: Path = PROJECT_ROOT) -> None:
    """Load local env files without overriding values injected by the host."""
    # Match Vite's local precedence while leaving Render/OS environment values
    # authoritative. Neither file is required in production.
    load_dotenv(project_root / ".env.local", override=False)
    load_dotenv(project_root / ".env", override=False)
