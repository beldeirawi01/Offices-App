import { ReactNode } from "react";
import { BrandMark, CheckCircleIcon } from "./Icons";

const BENEFITS = [
  "Turn a technician's voice note into a finished invoice in seconds",
  "Get paid faster with a built-in Stripe payment link",
  "Automatic overdue reminders — no more chasing clients by hand",
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-brand-panel">
        <div className="auth-brand-mark">
          <BrandMark width={20} height={20} />
        </div>
        <h1>Run your trades business from your pocket.</h1>
        <p>Jobscribe turns a voice note on-site into a paid invoice — no paperwork, no chasing clients.</p>
        <ul className="auth-benefits">
          {BENEFITS.map((benefit) => (
            <li key={benefit}>
              <CheckCircleIcon width={18} height={18} />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="auth-form-panel">{children}</div>
    </div>
  );
}
