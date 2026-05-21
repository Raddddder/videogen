# Module C: Edit Plan Generation Prompt

Use `StructureDNA` as the source template and `MaterialLibrary` as available assets.

Output:
- Strict `EditPlan` JSON
- Every source segment must map to one target segment
- Each segment must include `slot_status`
- Missing or weak slots must include a completion strategy

Allowed completion strategies:
- direct_match
- reorder
- copy
- packaging
- aigc
- reuse
