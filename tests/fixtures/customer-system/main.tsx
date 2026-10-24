import { createRoot } from 'react-dom/client';
import '../../../app/globals.css';
import { ThemeToggle } from '../../../app/components/theme-toggle';
import { MilkPlanBuilder } from '../../../app/milk/milk-plan-builder';
import { RazorpayCheckoutButton } from '../../../app/checkout/review/razorpay-checkout-button';
import milk from '../../../app/milk/milk.module.css';
import order from '../../../app/order/order.module.css';
import account from '../../../app/account/account.module.css';
import calendar from '../../../app/calendar/calendar.module.css';
import review from '../../../app/checkout/review/review.module.css';
import success from '../../../app/checkout/success/success.module.css';

const section = new URLSearchParams(location.search).get('view') ?? 'milk';
function App() {
  return <main className={milk.page}>
    <header className={milk.header}><span>Local synthetic UI fixture · {section}</span><ThemeToggle /></header>
    {section === 'milk' ? <MilkPlanBuilder /> : null}
    {section === 'order' ? <section className={order.page}><div className={order.layout}><div className={order.copy}><h1>Delivery details</h1></div><form className={order.form} onSubmit={e => e.preventDefault()}><label>Phone number<div className={order.phoneField}><span>+91</span><input type="tel" aria-label="Phone number" defaultValue="9000000000" /></div></label><label>Address<textarea className={order.addressField} defaultValue="Synthetic test address" /></label><fieldset className={order.bottleChoice}><legend>Bottle choice</legend><div><label><input type="radio" name="bottle" defaultChecked /><span><strong>Return a bottle</strong><small>Bring your existing bottle.</small></span></label><label><input type="radio" name="bottle" /><span><strong>New bottle</strong><small>Review the actual price before payment.</small></span></label></div></fieldset><button className={order.submitButton}>Review order</button></form></div></section> : null}
    {section === 'account' ? <section className={account.page}><div className={account.content}><h1>My M’ma</h1><p className={account.intro}>Synthetic account surface; no customer record is loaded.</p><a className={account.startOrder} href="#">Start an order</a><div className={account.planSection}><div className={account.planHeading}><h2>Your delivery routine</h2><span className={account.planStatus}>Awaiting confirmation</span></div><dl className={account.planSummary}><div><dt>Weekly milk</dt><dd>9 L</dd></div><div><dt>Deliveries</dt><dd>7 days</dd></div></dl><div className={account.planActions}><a className={account.openCalendar} href="#">Open calendar</a><a className={account.editPlan} href="#">Edit plan</a></div><div className={account.cancelRequest}><label>Reason<textarea className={account.reasonField} placeholder="Explain your request" /></label><button>Send request</button></div></div></div></section> : null}
    {section === 'calendar' ? <section className={calendar.page}><div className={calendar.content}><h1>Your delivery calendar</h1><div className={calendar.dayGrid}><a className={calendar.daySelected} href="#" aria-current="date"><time>Monday</time><strong>1 L milk · Selected</strong></a><a className={calendar.dayCard} href="#"><time>Tuesday</time><strong>1 L milk</strong></a></div><div className={calendar.editor}><div className={calendar.dayActions}><button>Skip delivery</button><button>Restore delivery</button></div><div className={calendar.itemEditor}><label>Milk for this date<select className={calendar.inputField} defaultValue="1"><option>1</option><option>2</option><option>3</option></select></label><button>Save quantity</button></div><form className={calendar.pauseForm} onSubmit={e => e.preventDefault()}><label>From<input className={calendar.inputField} type="date" defaultValue="2026-10-25" /></label><label>Until<input className={calendar.inputField} type="date" defaultValue="2026-10-27" /></label><button>Pause deliveries</button></form></div></div></section> : null}
    {section === 'checkout' ? <section className={review.page}><div className={review.shell}><div className={review.heading}><h1>Review your order</h1></div><section className={review.section}><div className={review.paymentHeading}><h2>Secure payment</h2></div><dl className={review.totals}><div><dt>Total</dt><dd>₹620</dd></div></dl><RazorpayCheckoutButton amount="₹620" orderId="synthetic-never-submitted" ready={false} /></section></div></section> : null}
    {section === 'success' ? <section className={success.page}><div className={success.content}><span className={success.mark}>✓</span><h1>Confirmation surface</h1><p className={success.intro}>Synthetic visual fixture, not a paid order.</p><div className={success.actions}><a className={success.primary} href="#">View profile</a><a className={success.secondary} href="#">Back to home</a></div></div></section> : null}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
