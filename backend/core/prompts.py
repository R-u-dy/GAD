"""Prompt templates for the two LLM interactions described in the paper
(Table 1): the first/main generation request, and the internal
self-evaluation feedback loop. Also includes the image-captioning
prompt, the syntax-error repair prompt, and detail-level / dimensional-
accuracy additions that go beyond the original paper.
"""

SYSTEM_ROLE = (
    "You are a 3D SCAD model generator. Based on the user's description, "
    "feedback, and provided reference images or projections, regenerate a "
    "valid OpenSCAD (.scad) file. The SCAD code must always be complete, "
    "valid, and formatted in OpenSCAD syntax."
)

RESPONSE_FORMAT_INSTRUCTIONS = (
    "Do not include explanations, questions, or any non-SCAD information. "
    "The SCAD code must always be complete and valid. The provided SCAD "
    "code should not be inside triple backticks.\n\n"
    'Respond in JSON format like this: {"description": "<text>", "code": "<code>"}\n'
    "Special characters like newlines (\\n) must be escaped as \\n. "
    "Respond with ONLY the JSON object, nothing else."
)

# Detail-tier quality instructions. "standard" mirrors the original
# paper's behavior; "production" pushes for the kind of polish a real
# manufactured/printed part needs (smooth curves, fillets, consistent
# wall thickness, parametric/modular code you could actually hand to
# someone else to edit).
DETAIL_INSTRUCTIONS = {
    "draft": (
        "Prioritize speed over polish: simple primitives and boolean "
        "operations are fine, sharp edges are fine, this is a rough "
        "concept pass."
    ),
    "standard": (
        "Write clean, readable OpenSCAD: use named variables for key "
        "dimensions near the top of the file instead of magic numbers, "
        "and set a reasonable $fn (e.g. 48) so curved surfaces look "
        "smooth rather than faceted."
    ),
    "production": (
        "This model needs to be production/manufacturing quality:\n"
        "- Define all key dimensions as named variables at the top of the "
        "file (not magic numbers scattered through the geometry), so it's "
        "easy for a human to tweak later.\n"
        "- Set $fn to at least 96 so curved surfaces are smooth, not "
        "faceted.\n"
        "- Add fillets or chamfers on edges where a real manufactured or "
        "3D-printed part would have them (sharp 90-degree edges are "
        "structurally weak and don't reflect real parts), using minkowski() "
        "or offset()-based rounding techniques.\n"
        "- Keep wall thickness consistent and appropriate for 3D printing "
        "(generally at least 1.2-2mm unless the user specifies otherwise).\n"
        "- Break the design into logical named modules (module foo() {...}) "
        "instead of one monolithic block, so the structure is inspectable.\n"
        "- If the description implies mounting, fastening, or assembly "
        "with another part, include reasonable clearance/tolerance (e.g. "
        "0.2-0.3mm) rather than exact-fit dimensions that won't actually "
        "assemble when printed."
    ),
}


def first_request_prompt(description: str, combined_libraries: str, detail_level: str = "standard") -> str:
    """Main-loop prompt: first request to generate a SCAD model."""
    detail_note = DETAIL_INSTRUCTIONS.get(detail_level, DETAIL_INSTRUCTIONS["standard"])
    return (
        f"{SYSTEM_ROLE}\n\n"
        f"Use this description to guide the SCAD model generation: {description}. "
        "Generate a valid OpenSCAD (.scad) file. "
        f"Analyze the following OpenSCAD libraries first and use them in this "
        f"model generation: {combined_libraries or 'none provided'}.\n\n"
        f"Quality requirements for this generation:\n{detail_note}\n\n"
        f"{RESPONSE_FORMAT_INSTRUCTIONS}"
    )


def syntax_fix_prompt(description: str, current_scad: str, error_message: str,
                       combined_libraries: str) -> str:
    """Used by the syntax-error feedback loop when OpenSCAD fails to
    parse the generated file."""
    return (
        f"{SYSTEM_ROLE}\n\n"
        f"The previous SCAD code you generated failed to run in OpenSCAD "
        f"with this error:\n{error_message}\n\n"
        f"Original description: {description}\n\n"
        f"Previous (broken) code:\n{current_scad}\n\n"
        f"Analyze the following OpenSCAD libraries first and use them in "
        f"this model generation: {combined_libraries or 'none provided'}. "
        "Fix the code so it is syntactically valid OpenSCAD.\n\n"
        f"{RESPONSE_FORMAT_INSTRUCTIONS}"
    )


def internal_feedback_prompt(current_scad: str, description: str,
                              combined_libraries: str, view_name: str,
                              measured_dimensions: str = "") -> str:
    """Self-evaluation loop prompt (Table 1, right column), extended with
    a real measured bounding box — the paper's self-eval only ever looks
    at a 2D projection image, which can't catch 'looks right but is the
    wrong size' errors. Giving the model the actual measured dimensions
    lets it check its own numeric claims against reality."""
    dimension_note = (
        f"\nThe actual rendered geometry measures {measured_dimensions}. "
        "Compare this against any dimensions stated in the description — "
        "if they don't match, that's a real defect, fix it in the code "
        "even if the projection image alone looks fine.\n"
        if measured_dimensions else ""
    )
    return (
        "You created a 3D SCAD model based on the user's description and "
        "provided reference images or projections. now you need to "
        "evaluate yourself. "
        f"Here is the current SCAD file content: {current_scad}. "
        f"Analyze the following OpenSCAD libraries first and use them in "
        f"this model generation: {combined_libraries or 'none provided'}.\n\n"
        f"This is the {view_name.lower()} projection of the model generated "
        f"by you. Use this description to refine the SCAD model generation: "
        f"{description}. compare this projection with description and "
        f"reference images. Is the model that you made good enough?\n"
        f"{dimension_note}\n"
        "Respond in JSON format. If yes, set the 'response' field to 'Yes'. "
        "If no, set the 'response' field to 'No' and include a valid "
        "OpenSCAD (.scad) code in the 'code' field.\n\n"
        'Example response: {"response": "Yes"} OR '
        '{"response": "No", "code": "<code>"}\n'
        "Special characters like newlines (\\n) must be escaped as \\n. "
        "Respond with ONLY the JSON object, nothing else."
    )


def image_naming_prompt() -> str:
    """Used when the user uploads images without any text description."""
    return (
        "Analyze the following image(s) encoded_image and suggest a "
        "descriptive name for a 3D SCAD model. Do not add material, "
        "standard, or size-related descriptions if they are not clearly "
        "given in my inputs. Replace any invalid characters with "
        "underscores (_). Respond with ONLY the suggested name, nothing else."
    )
