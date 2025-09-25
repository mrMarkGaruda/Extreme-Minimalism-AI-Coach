# Extreme Minimalism AI Coach - API Documentation

## Overview
Lightning-fast REST API endpoints for the minimalism coaching application with enhanced context awareness and progress tracking.

## Base URL
```
http://localhost:3000
```

## Endpoints

### 1. 💬 `/api/chat` - Enhanced Coaching Conversations
**Method:** `POST`
**Description:** Context-aware coaching conversations with optimized response quality

#### Request Body:
```json
{
  "message": "What should I start with for minimalism?",
  "userId": "user123",  // optional, defaults to "anonymous"
  "context": "Previous conversation context"  // optional
}
```

#### Response:
```json
{
  "response": "Great question! Let's start by identifying your essential daily items...",
  "userId": "user123",
  "timestamp": "2025-09-22T10:30:00.000Z",
  "context": "Used previous context"
}
```

#### Features:
- ⚡ Lightning-fast streaming responses
- 🧠 Context-aware conversations
- 🚫 Anti-loop protection with stop sequences
- 💾 Session memory per user

---

### 2. 📊 `/api/assessment` - User Profiling & Recommendations
**Method:** `POST`
**Description:** Comprehensive user assessment with personalized recommendations

#### Request Body:
```json
{
  "currentItems": 750,
  "lifestyle": "busy professional",  // optional
  "motivation": "stress reduction",  // optional
  "challenges": ["sentimental items", "time constraints"],  // optional
  "userId": "user123"  // optional
}
```

#### Response:
```json
{
  "profile": {
    "userId": "user123",
    "currentItems": 750,
    "lifestyle": "busy professional",
    "motivation": "stress reduction",
    "challenges": ["sentimental items", "time constraints"],
    "phase": "initial",
    "assessmentDate": "2025-09-22T10:30:00.000Z",
    "targetItems": 450
  },
  "recommendations": [
    "Start with obvious duplicates (multiple phone chargers, excess clothing)",
    "Focus on expired or broken items first",
    "Tackle one room at a time to avoid overwhelm"
  ],
  "phase": "initial",
  "nextSteps": [...],
  "estimatedTimeframe": "2-3 months"
}
```

#### Phases:
- **initial** (500+ items): Basic decluttering
- **reduction** (200-500 items): Strategic elimination
- **refinement** (100-200 items): Quality over quantity
- **optimization** (50-100 items): Final selections
- **maintenance** (≤50 items): Lifestyle maintenance

---

### 3. 📈 `/api/progress` - Journey Tracking
**Method:** `GET` and `POST`
**Description:** Track user progress and milestones over time

#### GET `/api/progress/:userId`
Get user's progress history

**Response:**
```json
{
  "userId": "user123",
  "milestones": [
    {
      "itemCount": 600,
      "date": "2025-09-15T10:00:00.000Z",
      "milestone": "Reached 600 items",
      "notes": "Cleared out closet",
      "improvement": 150
    }
  ],
  "currentPhase": "reduction",
  "startDate": "2025-09-01T10:00:00.000Z",
  "lastUpdate": "2025-09-22T10:30:00.000Z"
}
```

#### POST `/api/progress`
Add new milestone

**Request Body:**
```json
{
  "userId": "user123",
  "itemCount": 450,
  "milestone": "Completed bedroom declutter",  // optional
  "notes": "Donated 3 bags of clothes"  // optional
}
```

**Response:**
```json
{
  "success": true,
  "progress": { /* full progress object */ },
  "latestMilestone": { /* the milestone just added */ },
  "message": "Great progress! You've reduced to 450 items."
}
```

---

## Example Usage

### Test the Chat API:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "How do I start minimalism?", "userId": "test123"}'
```

### Test the Assessment API:
```bash
curl -X POST http://localhost:3000/api/assessment \
  -H "Content-Type: application/json" \
  -d '{"currentItems": 800, "lifestyle": "student", "userId": "test123"}'
```

### Test the Progress API:
```bash
# Get progress
curl http://localhost:3000/api/progress/test123

# Add milestone
curl -X POST http://localhost:3000/api/progress \
  -H "Content-Type: application/json" \
  -d '{"userId": "test123", "itemCount": 650, "notes": "Cleared garage"}'
```

---

## Performance Features

- ⚡ **Lightning Fast**: Optimized streaming responses
- 🧠 **Smart Context**: Maintains conversation context without speed loss
- 💾 **Memory Efficient**: Automatic session cleanup
- 🔄 **Real-time**: Both REST API and Socket.IO support
- 🛡️ **Error Handling**: Comprehensive error responses
- 📊 **Progress Tracking**: Automated phase transitions

## Error Responses

All endpoints return consistent error format:
```json
{
  "error": "Error description"
}
```

Common HTTP status codes:
- `400`: Bad Request (missing required fields)
- `500`: Internal Server Error
- `503`: Service Unavailable (AI model not ready)