"""PDF scan-report generation for existing CyberShield result records."""

import html
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


_MAX_REPORT_TEXT = 16000


def _format_value(value, suffix=""):
    if value is None or value == "":
        return "Not available"
    try:
        if isinstance(value, (int, float)):
            return f"{value:g}{suffix}"
    except (TypeError, ValueError):
        pass
    return str(value)


def _safe_paragraph_text(value):
    text = str(value or "Not available")[:_MAX_REPORT_TEXT]
    text = html.escape(text, quote=True)
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br/>")
    return text.encode("latin-1", "replace").decode("latin-1")


def create_scan_report_pdf(result, ledger_status):
    """Build a PDF from one stored scan result without rerunning a detector."""
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title="CyberShield Detection Report",
        author="CyberShield",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CyberShieldTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        textColor=colors.HexColor("#12345a"),
        spaceAfter=8,
    )
    section_style = ParagraphStyle(
        "CyberShieldSection",
        parent=styles["Heading2"],
        textColor=colors.HexColor("#12345a"),
        spaceBefore=10,
        spaceAfter=5,
    )
    body_style = styles["BodyText"]

    story = [
        Paragraph("CyberShield", title_style),
        Paragraph("AI Media Detection Report", styles["Heading1"]),
        Spacer(1, 5 * mm),
    ]

    scan_id = result.get("id") or "Not available"
    ledger_valid = bool(ledger_status.get("valid"))
    block_hash = result.get("block_hash")
    scan_verification = ledger_status.get("scan_verification") or {}
    if (
        ledger_valid
        and scan_verification.get("valid")
        and scan_verification.get("file_matches")
    ):
        chain_text = (
            "Ledger chain integrity: VALID; this scan's stored media hash "
            "matches its ledger certificate."
        )
    elif block_hash and ledger_valid:
        chain_text = (
            "Ledger chain integrity: VALID; this scan's certificate could not "
            "be independently matched to the current ledger."
        )
    elif block_hash:
        chain_text = "Ledger chain integrity: INVALID or unavailable."
    else:
        chain_text = "No scan certificate is available in the local hash-chain ledger."

    details = [
        ("Scan ID", scan_id),
        ("Scan date/time", result.get("timestamp")),
        ("Media type", result.get("media_type")),
        ("Original prediction", result.get("prediction")),
        ("Model", result.get("model")),
        ("REAL score", _format_value(result.get("real_probability", result.get("real")), "%")),
        ("FAKE score", _format_value(result.get("fake_probability", result.get("fake")), "%")),
        ("Confidence", _format_value(result.get("confidence"), "%")),
        ("Risk score", _format_value(result.get("risk_score", result.get("risk")), "%")),
        ("Risk level", result.get("risk_level")),
        ("Media SHA-256", result.get("media_hash")),
        ("Hash-chain status", chain_text),
        ("Original-file match", "Not checked during report generation."),
        ("Ledger block index", result.get("block_index")),
        ("Block hash", block_hash),
    ]
    table = Table(
        [
            [
                Paragraph(_safe_paragraph_text(label), body_style),
                Paragraph(_safe_paragraph_text(value), body_style),
            ]
            for label, value in details
        ],
        colWidths=[45 * mm, 130 * mm],
        repeatRows=0,
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#edf3f8")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#ccd6e0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(table)

    scam = result.get("scam_intelligence")
    if str(result.get("media_type", "")).lower() == "audio":
        story.append(Paragraph("AI Voice Scam Intelligence", section_style))
        if isinstance(scam, dict):
            story.append(Paragraph(
                f"Scam risk: {_safe_paragraph_text(scam.get('risk_level', 'UNKNOWN'))}",
                body_style,
            ))
            story.append(Paragraph(
                f"Summary: {_safe_paragraph_text(scam.get('summary', 'Not available'))}",
                body_style,
            ))
            story.append(Paragraph(
                f"Transcript: {_safe_paragraph_text(scam.get('transcript', 'Not available'))}",
                body_style,
            ))
            indicators = scam.get("indicators") or []
            if indicators:
                story.append(Paragraph("Detected indicators", styles["Heading3"]))
                for indicator in indicators:
                    label = _safe_paragraph_text(indicator.get("label", "Warning"))
                    description = _safe_paragraph_text(indicator.get("description", ""))
                    story.append(Paragraph(f"• {label}: {description}", body_style))
                    for excerpt in indicator.get("excerpts") or []:
                        story.append(Paragraph(
                            f"Transcript excerpt: {_safe_paragraph_text(excerpt)}",
                            body_style,
                        ))
            recommendations = scam.get("recommendations") or []
            if recommendations:
                story.append(Paragraph("Safety recommendations", styles["Heading3"]))
                for recommendation in recommendations:
                    story.append(Paragraph(
                        f"• {_safe_paragraph_text(recommendation)}",
                        body_style,
                    ))
        else:
            story.append(Paragraph("Scam risk: UNKNOWN", body_style))
            story.append(Paragraph("Transcription and scam analysis: Not available.", body_style))

    explanation = result.get("explanation")
    story.append(Paragraph("Why This Result?", section_style))
    if isinstance(explanation, dict):
        story.append(Paragraph(
            _safe_paragraph_text(explanation.get("summary", "Not available")),
            body_style,
        ))
        story.append(Paragraph(
            _safe_paragraph_text(explanation.get("visualization_note", "")),
            body_style,
        ))
        story.append(Paragraph(
            _safe_paragraph_text(explanation.get("caveat", "")),
            body_style,
        ))
    else:
        story.append(Paragraph("Explanation: Not available.", body_style))

    story.extend([
        Paragraph("Disclaimer", section_style),
        Paragraph(
            "AI predictions and rule-based scam indicators are estimates, not definitive proof "
            "that media is authentic, manipulated, or part of a scam. A SHA-256 hash can help "
            "check whether a file matches a stored scan certificate; it does not prove that the "
            "AI prediction is correct. The hash-chain ledger is local and is not a decentralized "
            "public blockchain.",
            body_style,
        ),
    ])
    document.build(story)
    return buffer.getvalue()
