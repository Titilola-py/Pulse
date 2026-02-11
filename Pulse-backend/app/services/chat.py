"""
Chat service for handling chat operations and database interactions (Synchronous)
"""
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select, and_
from app.models.conversation import Conversation, Message
from app.models.user import User
from app.schemas.chat import MessageCreate, ConversationCreate
from typing import Optional, List
from datetime import datetime


class ChatService:
    """Service for managing chat operations and persistence"""
    
    @staticmethod
    def create_conversation(
        db: Session,
        conversation_data: ConversationCreate,
        creator_id: str
    ) -> Conversation:
        """Create a new conversation with participants"""
        # Ensure creator is in participants
        participant_ids = list(set(conversation_data.participant_ids + [creator_id]))
        
        # Fetch all participant users
        stmt = select(User).where(User.id.in_(participant_ids))
        participants = db.execute(stmt).scalars().all()
        
        # Create conversation
        conversation = Conversation(
            name=conversation_data.name,
            description=conversation_data.description,
            is_group=conversation_data.is_group,
            users=participants
        )
        
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        
        return conversation
    
    @staticmethod
    def get_conversation(db: Session, conversation_id: str) -> Optional[Conversation]:
        """Get a conversation by ID with eager loaded relationships"""
        stmt = select(Conversation).where(
            Conversation.id == conversation_id
        ).options(
            selectinload(Conversation.users),
            selectinload(Conversation.messages).selectinload(Message.sender)
        )
        
        result = db.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    def create_message(
        db: Session,
        conversation_id: str,
        sender_id: str,
        message_data: MessageCreate
    ) -> Message:
        """Create and persist a new message"""
        message = Message(
            conversation_id=conversation_id,
            sender_id=sender_id,
            content=message_data.content
        )
        
        db.add(message)
        db.commit()
        db.refresh(message, ["sender"])
        
        return message
    
    @staticmethod
    def get_messages(
        db: Session,
        conversation_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Message]:
        """Get messages from a conversation with pagination"""
        stmt = select(Message).where(
            Message.conversation_id == conversation_id
        ).options(
            selectinload(Message.sender)
        ).order_by(
            Message.created_at.asc()
        ).limit(limit).offset(offset)
        
        result = db.execute(stmt)
        return result.scalars().all()
    
    @staticmethod
    def user_in_conversation(
        db: Session,
        conversation_id: str,
        user_id: str
    ) -> bool:
        """Check if a user is a participant in a conversation"""
        stmt = select(Conversation).where(
            and_(
                Conversation.id == conversation_id,
                Conversation.users.any(User.id == user_id)
            )
        )
        
        result = db.execute(stmt)
        return result.scalar_one_or_none() is not None
    
    @staticmethod
    def get_user_conversations(
        db: Session,
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Conversation]:
        """Get all conversations for a user"""
        stmt = select(Conversation).where(
            Conversation.users.any(User.id == user_id)
        ).options(
            selectinload(Conversation.users),
            selectinload(Conversation.messages)
        ).order_by(
            Conversation.updated_at.desc()
        ).limit(limit).offset(offset)
        
        result = db.execute(stmt)
        return result.scalars().all()
    
    @staticmethod
    def edit_message(
        db: Session,
        message_id: str,
        new_content: str
    ) -> Optional[Message]:
        """Edit an existing message"""
        stmt = select(Message).where(Message.id == message_id)
        result = db.execute(stmt)
        message = result.scalar_one_or_none()
        
        if message:
            message.content = new_content
            message.is_edited = True
            message.updated_at = datetime.utcnow()
            
            db.add(message)
            db.commit()
            db.refresh(message, ["sender"])
        
        return message
    
    @staticmethod
    def mark_message_delivered(
        db: Session,
        message_id: str,
        delivered_at: Optional[datetime] = None
    ) -> Optional[Message]:
        """Mark a message as delivered"""
        stmt = select(Message).where(Message.id == message_id)
        result = db.execute(stmt)
        message = result.scalar_one_or_none()

        if message:
            message.delivered_at = delivered_at or datetime.utcnow()
            db.add(message)
            db.commit()
            db.refresh(message)

        return message

    @staticmethod
    def mark_message_read(
        db: Session,
        message_id: str,
        conversation_id: str,
        read_at: Optional[datetime] = None
    ) -> Optional[Message]:
        """Mark a message as read"""
        stmt = select(Message).where(
            Message.id == message_id,
            Message.conversation_id == conversation_id
        )
        result = db.execute(stmt)
        message = result.scalar_one_or_none()

        if message:
            message.read_at = read_at or datetime.utcnow()
            db.add(message)
            db.commit()
            db.refresh(message)

        return message

    @staticmethod
    def soft_delete_message(
        db: Session,
        message_id: str,
        requester_id: str,
        conversation_id: Optional[str] = None
    ) -> tuple[str, Optional[Message]]:
        """Soft delete a message and hide its content"""
        stmt = select(Message).where(Message.id == message_id)
        if conversation_id:
            stmt = stmt.where(Message.conversation_id == conversation_id)
        result = db.execute(stmt)
        message = result.scalar_one_or_none()

        if not message:
            return "not_found", None
        if message.sender_id != requester_id:
            return "forbidden", None

        message.is_deleted = True
        message.content = ""
        message.updated_at = datetime.utcnow()
        db.add(message)
        db.commit()
        db.refresh(message)

        return "ok", message

    @staticmethod
    def delete_message(
        db: Session,
        message_id: str,
        requester_id: str,
        conversation_id: Optional[str] = None
    ) -> bool:
        """Soft delete a message"""
        status, _ = ChatService.soft_delete_message(
            db=db,
            message_id=message_id,
            requester_id=requester_id,
            conversation_id=conversation_id,
        )
        return status == "ok"

