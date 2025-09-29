# AI Optimization Log

_Date: 2025-09-29_

## Coaching Style Experiments
- **Supportive vs. Direct:** Routed friendly reflection prompts ("I feel overwhelmed", "Can you help me get started?") through the new approach selector. Supportive mode now yields warm encouragement with a 0.63 temperature baseline and ~190 token budgets. Decisive prompts ("Tell me what to cut", "Be blunt") flip to `direct`, dropping temperature to ~0.58 (0.50 in decision mode) with crisp action lists.
- **Question-based vs. Advice:** Messages ending in `?` or containing "can you" automatically shift to the `question` approach. Observed responses opening with two probing questions before offering guidance. Statements revert to advice-forward supportive or direct responses depending on other cues.
- **Emotional vs. Logical reasoning:** Requests mentioning "data", "numbers", "plan", or a desire for metrics triggered the `logical` approach. Responses referenced progress metrics (current/target items) and leaned on checklists and cost-benefit framing.

## Response Quality Tuning
- Consolidated generation presets inside `getGenerationSettings(mode, approach, emotion, crisis)`.
    - General supportive baseline: `temp 0.63`, `max_tokens 190`, `top_p 0.90`.
    - Questioning bumps `temp` +0.05 (up to ~0.68) and `top_p 0.92` for exploratory replies.
    - Direct subtracts `temp` 0.05 (down to ~0.58, or 0.50 in decision mode) and `top_p 0.88` for focus.
    - Logical floors `temp` at 0.55→0.50 and sets `top_p 0.87` to tighten coherence.
- Mode-aware defaults (assessment/decision/emergency) cap `max_tokens` and shift temperature before approach adjustments so the same framework works across entry points.
- Emotion-aware tuning adds +20 tokens when the user is overwhelmed, raises `temp` for excitement/celebration, and crisis mode locks to `temp 0.45`, `top_p 0.85`, and at least 220 tokens for steady de-escalation narratives.
- Validation: ran three-round conversations per mode ensuring recency context remained in the prompt and that each turn respected the configured settings (verified via logging and response tone).

## Specialized Response Patterns
- **Emotion Detection:** Keyword heuristics (supplemented by crisis phrase list) flag `overwhelm`, `resistance`, `excitement`, `celebration`, and `crisis`. The prompt now receives explicit directives per state so the LLM mirrors the intended support strategy.
- **Adaptive Coaching:** `determineCoachingApproach` weighs mode, stored preferences, and message cues to set an approach. `getApproachDirective` and the emotion directive feed directly into the system prompt so the tone is reinforced without extra few-shot examples.
- **Crisis Intervention:** Phrases like "I want to quit" or "can't go on" mark crisis mode. Prompt injects a grounding protocol (reassurance + micro-step + support reminder) and the generator locks to calm settings for longer, steady replies.

## Next Steps
- Expand emotion detection beyond keyword heuristics (e.g., sentiment classifier).
- Capture automated metrics (response length, sentiment shift) to quantify improvements.
- Explore reinforcement of style via few-shot exemplars in each prompt template.
