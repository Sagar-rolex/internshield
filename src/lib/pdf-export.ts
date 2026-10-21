// ── PDF Export Utility using browser print / clean window.print or native jsPDF-less formatting ──
// Since external npm registry access is restricted in this offline sandbox,
// we build a robust, professional printable report view / PDF export using window.print()
// or clean HTML document generation that renders pristine printable styles.

import { AnalysisResult } from "@/lib/api";

export function generatePdfReport(result: AnalysisResult) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to download the PDF report.");
    return;
  }

  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const timeStr = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const riskColorClass =
    result.risk === "High"
      ? "#ef4444"
      : result.risk === "Medium"
        ? "#f59e0b"
        : "#10b981";

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>InternShield AI - Job Safety Analysis Report</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937;
      line-height: 1.5;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    .header {
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand {
      font-size: 20px;
      font-weight: 700;
      color: #2563eb;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .report-meta {
      text-align: right;
      font-size: 12px;
      color: #6b7280;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      margin: 0 0 8px 0;
      color: #111827;
    }
    .subtitle {
      font-size: 14px;
      color: #4b5563;
      margin-bottom: 24px;
    }
    .card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      page-break-inside: avoid;
    }
    .score-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: ${result.safe ? "#ecfdf5" : result.risk === "High" ? "#fef2f2" : "#fffbeb"};
      border: 1px solid ${result.safe ? "#a7f3d0" : result.risk === "High" ? "#fecaca" : "#fde68a"};
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .score-value {
      font-size: 36px;
      font-weight: 800;
      color: ${riskColorClass};
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 9999px;
      background: ${riskColorClass};
      color: #ffffff;
    }
    h2 {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 12px 0;
      color: #111827;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 6px;
    }
    ul {
      margin: 0;
      padding-left: 20px;
    }
    li {
      margin-bottom: 6px;
      font-size: 13px;
    }
    .signal-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      padding: 4px 0;
      border-bottom: 1px dashed #e5e7eb;
    }
    .footer {
      margin-top: 40px;
      border-top: 1px solid #e5e7eb;
      padding-top: 12px;
      font-size: 11px;
      color: #9ca3af;
      text-align: center;
    }
    .disclaimer {
      font-size: 11px;
      color: #6b7280;
      background: #f3f4f6;
      padding: 12px;
      border-radius: 6px;
      margin-top: 24px;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">🛡️ ScamShield.AI</div>
      <h1>Job & Internship Safety Analysis Report</h1>
      <div class="subtitle">Generated on ${dateStr} at ${timeStr}</div>
    </div>
    <div class="report-meta">
      <div><strong>Analysis ID:</strong> ${result.id.slice(0, 12)}...</div>
      <div><strong>Source:</strong> ${result.input_type === "screenshot" ? "Screenshot OCR" : "Manual Entry"}</div>
    </div>
  </div>

  <div class="score-banner">
    <div>
      <div style="font-size: 14px; color: #4b5563; font-weight: 500;">Scam Probability Score</div>
      <div class="score-value">${result.probability}%</div>
      <div style="font-size: 13px; color: #4b5563; margin-top: 4px;">Trust Score: <strong>${result.trust_score}%</strong></div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Risk Assessment</div>
      <span class="badge">${result.risk.toUpperCase()} RISK (${result.safe ? "SAFE" : "UNSAFE"})</span>
    </div>
  </div>

  <div class="card">
    <h2>Job & Company Details</h2>
    <p><strong>Job Title:</strong> ${result.job_title || "Not specified"}</p>
    <p><strong>Company Name:</strong> ${result.company || "Not specified"}</p>
    ${result.website ? `<p><strong>Website:</strong> ${result.website}</p>` : ""}
    ${result.description ? `<p style="margin-top: 8px;"><strong>Description:</strong><br><span style="white-space: pre-wrap; font-size: 13px; color: #4b5563;">${result.description}</span></p>` : ""}
  </div>

  ${
    result.reasons.length > 0
      ? `
  <div class="card" style="border-color: #fecaca; background: #fff5f5;">
    <h2 style="color: #991b1b; border-color: #fecaca;">Risk Factors & Red Flags</h2>
    <ul>
      ${result.reasons.map((r) => `<li style="color: #7f1d1d;">${r}</li>`).join("")}
    </ul>
  </div>
  `
      : ""
  }

  ${
    result.signals && result.signals.length > 0
      ? `
  <div class="card">
    <h2>Rule-Based Signal Breakdown</h2>
    <div>
      ${result.signals
        .map(
          (s) => `
        <div class="signal-row">
          <span style="${s.triggered ? "color: #dc2626; font-weight: 600;" : "color: #4b5563;"}">
            ${s.triggered ? "●" : "○"} ${s.name}
          </span>
          <span style="font-family: monospace;">${s.triggered ? `+${s.weight}` : "0"}</span>
        </div>
      `,
        )
        .join("")}
    </div>
  </div>
  `
      : ""
  }

  ${
    result.positives.length > 0
      ? `
  <div class="card" style="border-color: #a7f3d0; background: #ecfdf5;">
    <h2 style="color: #065f46; border-color: #a7f3d0;">Positive Indicators</h2>
    <ul>
      ${result.positives.map((p) => `<li style="color: #047857;">${p}</li>`).join("")}
    </ul>
  </div>
  `
      : ""
  }

  <div class="card">
    <h2>Safety Recommendations & Next Steps</h2>
    <ul>
      ${result.recommendations.map((rec) => `<li>${rec}</li>`).join("")}
    </ul>
  </div>

  <div class="disclaimer">
    <strong>Disclaimer:</strong> This report is an automated assessment based on the information available at the time of analysis. It is intended to help identify potential warning signs and does not independently establish whether an employer or job offer is fraudulent or legitimate. Verify important details through independent, trusted sources before making financial or career decisions.
  </div>

  <div class="footer">
    InternShield AI &bull; Secure Job & Internship Safety Analysis Report &bull; Page 1 of 1
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
