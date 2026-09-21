import PDFDocument from "pdfkit";
import { PassThrough } from "stream";

interface InvoicePdfData {
  invoiceNumber: string;
  createdAt: Date;
  dueDate: Date | null;
  status: string;
  organizationName: string;
  client: { name: string; email: string | null; phone: string | null; addressLine1: string | null };
  lineItems: { description: string; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
}

/** Renders a simple, clean invoice PDF and returns it as a Buffer. */
export function renderInvoicePdf(invoice: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    doc.pipe(stream);

    doc.fontSize(20).text(invoice.organizationName, { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(14).text(`Invoice ${invoice.invoiceNumber}`);
    doc.fontSize(10).fillColor("#666").text(`Status: ${invoice.status}`);
    doc.text(`Date: ${invoice.createdAt.toLocaleDateString()}`);
    if (invoice.dueDate) doc.text(`Due: ${invoice.dueDate.toLocaleDateString()}`);
    doc.fillColor("#000").moveDown();

    doc.fontSize(12).text("Bill to:");
    doc.fontSize(10).text(invoice.client.name);
    if (invoice.client.addressLine1) doc.text(invoice.client.addressLine1);
    if (invoice.client.email) doc.text(invoice.client.email);
    if (invoice.client.phone) doc.text(invoice.client.phone);
    doc.moveDown();

    const tableTop = doc.y;
    doc.fontSize(10).fillColor("#666");
    doc.text("Description", 50, tableTop);
    doc.text("Qty", 320, tableTop);
    doc.text("Unit Price", 380, tableTop);
    doc.text("Amount", 470, tableTop);
    doc.fillColor("#000");
    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

    let y = tableTop + 22;
    for (const item of invoice.lineItems) {
      doc.fontSize(10);
      doc.text(item.description, 50, y, { width: 260 });
      doc.text(String(item.quantity), 320, y);
      doc.text(`$${item.unitPrice.toFixed(2)}`, 380, y);
      doc.text(`$${item.amount.toFixed(2)}`, 470, y);
      y += 20;
    }

    doc.moveTo(50, y + 5).lineTo(545, y + 5).stroke();
    y += 15;
    doc.text(`Subtotal: $${invoice.subtotal.toFixed(2)}`, 380, y);
    y += 15;
    doc.text(`Tax: $${invoice.tax.toFixed(2)}`, 380, y);
    y += 15;
    doc.fontSize(12).text(`Total: $${invoice.total.toFixed(2)}`, 380, y);

    if (invoice.notes) {
      doc.moveDown(2);
      doc.fontSize(10).fillColor("#666").text("Notes:").fillColor("#000").text(invoice.notes);
    }

    doc.end();
  });
}
