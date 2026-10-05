from typing import Optional

from pydantic import BaseModel


class AccountOut(BaseModel):
    code: str
    name: str
    parent_code: Optional[str] = None
    level: int
    type: str
    direction: str
    is_leaf: bool
    status: str

    model_config = {"from_attributes": True}


class AccountCreate(BaseModel):
    code: str
    name: str
    parent_code: Optional[str] = None
    type: str
    direction: str
    remark: Optional[str] = None
