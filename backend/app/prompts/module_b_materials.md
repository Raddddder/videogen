# Module B: Material Library Prompt

Convert uploaded user materials into reusable labels for slot matching.

Input:
- File metadata
- Key frames
- Optional ASR text
- User target brief

Output:
- Strict `MaterialLibrary` JSON
- Do not decide the final edit plan here
- Only describe what each material can support

Focus:
- shot_type
- semantic_role
- tags
- usable_ranges
- quality_score
- crop_risk
