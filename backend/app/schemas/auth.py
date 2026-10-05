from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: str
    username: str
    name: str
    role: str
    avatar_color: str

    model_config = {"from_attributes": True}


TokenResponse.model_rebuild()
