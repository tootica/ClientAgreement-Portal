import {validateClientDetails, clientDetailsLines} from './client-details.mjs';
import {confirmationEmailState} from './confirmation-state.mjs';
import {availablePackage,packageName} from './packages.mjs';
import {validateConfig, validateOrder, requestPayment, isConfirmedPayment} from './payment-service.mjs';
const invoiceToken = new URLSearchParams(location.hash.slice(1)).get('invoice');
let invitationToken = new URLSearchParams(location.hash.slice(1)).get('invite');
// Keep the invoice access token out of copied URLs and later navigation.
if (invoiceToken || invitationToken) history.replaceState(null, '', location.pathname + location.search);
// An invitation pasted into an already-open registration tab changes only the fragment.
window.addEventListener('hashchange',()=>{if(new URLSearchParams(location.hash.slice(1)).has('invite'))location.reload();});
import {createSignatureAnimation} from './signature-animation.mjs?v=42d5516fc8cd';

const sections = [...document.querySelectorAll('.terms-content section')];
const tocLinks = [...document.querySelectorAll('.toc-links a')];
const iconPaths = [
  '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-5h6v5M8 7h1m6 0h1m-8 4h1m6 0h1"/>',
  '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20M6 15h4"/>',
  '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v5m6-5v5M9 18v5m6-5v5M1 9h5m-5 6h5m12-6h5m-5 6h5M10 10h4v4h-4z"/>',
  '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4m-5-9 4-3 6 3"/>',
  '<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 12h3v7H3zm15 0h3v7h-3zM21 19v1a2 2 0 0 1-2 2h-5"/>',
  '<path d="M12 5c-3-2-7-2-10-1v16c3-1 7-1 10 1m0-16c3-2 7-2 10-1v16c-3-1-7-1-10 1zm0 0v16"/>'
];
document.querySelectorAll('.toc-icon').forEach((icon, index) => {
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<svg viewBox="0 0 24 24">${iconPaths[index]}</svg>`;
});
let scheduled = false;
function updateActiveSection() {
  let current = sections[0];
  for (const section of sections) if (section.getBoundingClientRect().top <= 150) current = section;
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 30) current = sections.at(-1);
  tocLinks.forEach(link => {
    const active = link.hash === '#' + current.id;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  scheduled = false;
}
window.addEventListener('scroll', () => {
  if (!scheduled) { requestAnimationFrame(updateActiveSection); scheduled = true; }
}, {passive:true});
updateActiveSection();
document.querySelector('#year').textContent = new Date().getFullYear();
const searchInput = document.getElementById('term-search');
const searchStatus = document.getElementById('search-status');
const navbarSearch = document.getElementById('navbar-search');
const searchToggle = document.getElementById('search-toggle');
const searchContent = document.getElementById('navbar-search-content');
const agreementContent = document.querySelector('.terms-content');
let searchMatches = [];
let currentMatch = -1;
let activeQuery = '';
function closeSearch() {
  navbarSearch.classList.remove('is-open');
  searchToggle.setAttribute('aria-expanded', 'false');
  searchContent.hidden = true;
  searchToggle.focus();
}
searchToggle.addEventListener('click', () => {
  if (navbarSearch.classList.contains('is-open')) {
    navigateToMatch(1);
    return;
  }
  navbarSearch.classList.add('is-open');
  searchToggle.setAttribute('aria-expanded', 'true');
  searchContent.hidden = false;
  searchInput.focus();
});
document.getElementById('search-close').addEventListener('click', closeSearch);
navbarSearch.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeSearch();
  if (event.target === searchInput && event.key === 'Enter') {
    event.preventDefault();
    navigateToMatch(event.shiftKey ? -1 : 1);
  }
});
function clearSearchHighlights() {
  agreementContent.querySelectorAll('mark.search-match').forEach(mark => {
    mark.replaceWith(document.createTextNode(mark.textContent));
  });
  agreementContent.normalize();
  searchMatches = [];
  currentMatch = -1;
}
function highlightSearch() {
  const query = searchInput.value.trim().toLowerCase();
  clearSearchHighlights();
  activeQuery = query;
  if (!query) {
    searchStatus.textContent = '';
    return;
  }
  const walker = document.createTreeWalker(agreementContent, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('section') && !node.parentElement.closest('button, a') && node.textContent.toLowerCase().includes(query)) textNodes.push(node);
  }
  textNodes.forEach(node => {
    const originalText = node.textContent;
    const lowerText = originalText.toLowerCase();
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let index = lowerText.indexOf(query);
    while (index !== -1) {
      fragment.append(document.createTextNode(originalText.slice(cursor, index)));
      const mark = document.createElement('mark');
      mark.className = 'search-match';
      mark.textContent = originalText.slice(index, index + query.length);
      fragment.append(mark);
      searchMatches.push(mark);
      cursor = index + query.length;
      index = lowerText.indexOf(query, cursor);
    }
    fragment.append(document.createTextNode(originalText.slice(cursor)));
    node.replaceWith(fragment);
  });
  searchStatus.textContent = searchMatches.length ? `${searchMatches.length} found` : 'No matches';
}
function navigateToMatch(direction) {
  if (searchInput.value.trim().toLowerCase() !== activeQuery) highlightSearch();
  if (!searchMatches.length) return;
  if (currentMatch >= 0) searchMatches[currentMatch].classList.remove('is-current');
  currentMatch = currentMatch < 0 ? (direction > 0 ? 0 : searchMatches.length - 1) : (currentMatch + direction + searchMatches.length) % searchMatches.length;
  const match = searchMatches[currentMatch];
  match.classList.add('is-current');
  searchStatus.textContent = `${currentMatch + 1}/${searchMatches.length}`;
  const section = match.closest('section');
  if (section) history.replaceState(null, '', `#${section.id}`);
  match.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'center'});
}
searchInput.addEventListener('input', highlightSearch);

// Required acceptance and signature fields gate the Payment stage.
const agreementForm = document.getElementById('agreement-form');
const agreementConsent = document.getElementById('accept-client-agreement');
const signatureInput = document.getElementById('client-signature');
const emailInput = document.getElementById('client-email');
const signAgreementButton = document.getElementById('sign-agreement');
const signatureError = document.getElementById('signature-error');
const termsStage = document.getElementById('main');
const paymentStage = document.getElementById('payment-stage');
const packageStage = document.getElementById('package-stage');
const confirmationStage = document.getElementById('confirmation-stage');
const paymentErrorStage = document.getElementById('payment-error-stage');
const paymentPreloader = document.getElementById('payment-preloader');
const siteShell = document.querySelector('.site-shell');
let cancelPaymentTransition = null;
function waitForPaymentTransition() {
  return new Promise(resolve => {
    const timer = setTimeout(() => {cancelPaymentTransition = null;resolve(true);}, 1800);
    cancelPaymentTransition = () => {clearTimeout(timer);cancelPaymentTransition = null;resolve(false);};
  });
}
const progressSteps = [...document.querySelectorAll('.progress-step')];
let clientDetails = null;
let selectedPackage = 'essential';
let detailsLocked = false;
const detailsStage = document.getElementById('client-details-stage');
const detailsForm = document.getElementById('client-details-form');
const invitationStage = document.getElementById('invitation-stage');
let invitedEmail = '';
detailsForm.inert = true;
agreementForm.inert = true;
function showInvitationNotice(message) {
  detailsStage.hidden=true;packageStage.hidden=true;termsStage.hidden=true;paymentStage.hidden=true;confirmationStage.hidden=true;paymentErrorStage.hidden=true;navbarSearch.hidden=true;
  invitationStage.hidden=false;
  document.getElementById('invitation-message').textContent=message;
  document.querySelector('.hero-title h1').textContent='Client invitation';
  document.querySelector('.hero-title p').textContent='Registration for invited Tootica clients.';
  document.querySelector('.skip-link').setAttribute('href','#invitation-stage');
  invitationStage.focus({preventScroll:true});
}
document.getElementById('invitation-read-agreement').addEventListener('click',()=>showAgreementStage(false,true));
const detailFields = [...detailsForm.querySelectorAll('input[name]')];
function renderClientDetails() {
  if (!clientDetails) return;
  for (const container of document.querySelectorAll('.client-details-summary')) {
    container.replaceChildren(...[...clientDetailsLines(clientDetails),'Package: ' + packageName(selectedPackage) + ' (annual plan)'].map(line => {
      const paragraph = document.createElement('p'); paragraph.textContent = line; return paragraph;
    }));
  }
  signatureInput.value = clientDetails.contactName;
}
function populateClientDetails(value, locked = false) {
  clientDetails = value;
  detailsLocked = locked;
  for (const field of detailFields) {field.value = field.name === 'phone' ? (value.phone || '').replace(/^\+91(?=\d{10}$)/,'') : value[field.name] || ''; field.readOnly = locked || (field.name==='email' && Boolean(invitedEmail)); field.setCustomValidity('');}
  document.getElementById('details-lock-notice').hidden = !locked;
  for (const name of ['phone','email']) {
    detailsForm.elements.namedItem(name).removeAttribute('aria-invalid');
    const error = document.getElementById(`client-${name}-error`);
    error.textContent = ''; error.hidden = true;
  }
  renderClientDetails();
}
function updateProgress(current) {
  progressSteps.forEach((step,index) => {
    step.classList.toggle('is-current', index === current);
    step.classList.toggle('is-complete', index < current);
    step.removeAttribute('aria-current');
    step.querySelector('.visually-hidden')?.remove();
    step.querySelector('.step-marker').textContent = index < current ? String.fromCharCode(10003) : String(index+1).padStart(2,'0');
    if (index === current) step.setAttribute('aria-current','step');
  });
}
function showDetailsStage() {
  if(detailsForm.inert) {showInvitationNotice('Open your invitation link to register.');return;}
  invitationStage.hidden = true;
  paymentErrorStage.hidden = true;
  packageStage.hidden = true;
  confirmationStage.hidden = true;
  detailsStage.hidden = false; termsStage.hidden = true; paymentStage.hidden = true; navbarSearch.hidden = true;
  document.body.classList.remove('is-payment-stage');
  document.querySelector('.hero-title h1').textContent = 'Client Details';
  document.querySelector('.hero-title p').textContent = 'Tell us about your clinic and billing contact.';
  document.title = 'Client Details - Tootica';
  document.querySelector('.skip-link').setAttribute('href','#client-details-stage');
  updateProgress(0); history.replaceState(null,'','#details');
  detailsStage.focus({preventScroll:true});
  detailsStage.scrollIntoView({behavior:'smooth',block:'start'});
}
detailsForm.addEventListener('submit', event => {
  event.preventDefault();
  const result = validateClientDetails(Object.fromEntries(new FormData(detailsForm)));
  for (const field of detailFields) field.setCustomValidity(result.errors[field.name] || '');
  if (!detailsForm.reportValidity() || !result.valid) return;
  if (JSON.stringify(clientDetails) !== JSON.stringify(result.value)) {
    agreementConsent.checked = false;
    signatureAnimation.clear();
  }
  populateClientDetails(result.value,detailsLocked);
  updateAgreementRequirements();
  showPackageStage();
});
function showPackageStage() {
  invitationStage.hidden = true;
  paymentErrorStage.hidden = true;
  if (!clientDetails) return;
  detailsStage.hidden = true; termsStage.hidden = true; paymentStage.hidden = true; confirmationStage.hidden = true; navbarSearch.hidden = true;
  packageStage.hidden = false;
  document.body.classList.remove('is-payment-stage');
  document.querySelector('.hero-title h1').textContent = 'Choose your package';
  document.querySelector('.hero-title p').textContent = 'Select a package to continue your registration.';
  document.title = 'Choose your package - Tootica';
  document.querySelector('.skip-link').setAttribute('href','#package-stage');
  updateProgress(1); history.replaceState(null,'','#package');
  packageStage.focus({preventScroll:true});
  document.querySelector('.agreement-progress').scrollIntoView({behavior:'smooth',block:'start'});
}
document.getElementById('package-form').addEventListener('submit',event=>{
  event.preventDefault();
  const value=new FormData(event.currentTarget).get('package');
  const error=document.getElementById('package-error');
  if (!availablePackage(value)) {error.textContent='Please select an available package to continue.';error.hidden=false;return;}
  error.hidden=true;
  if (selectedPackage !== value) {agreementConsent.checked=false;signatureAnimation.clear();}
  selectedPackage=value;
  renderClientDetails();
  updateAgreementRequirements();
  showAgreementStage(false,true);
});
document.getElementById('package-back-button').addEventListener('click',()=>showDetailsStage());
for (const field of detailFields) field.addEventListener('input',() => {field.setCustomValidity('');});
for (const name of ['phone','email']) {
  const field = detailsForm.elements.namedItem(name);
  const error = document.getElementById(`client-${name}-error`);
  function validateContact() {
    const result = validateClientDetails(Object.fromEntries(new FormData(detailsForm)));
    const message = result.errors[name] || '';
    field.setCustomValidity(message);
    field.setAttribute('aria-invalid',String(Boolean(message)));
    error.textContent = message;
    error.hidden = !message;
  }
  field.addEventListener('blur',validateContact);
  field.addEventListener('input',() => {if (!error.hidden) validateContact(); else field.removeAttribute('aria-invalid');});
}
for (const button of document.querySelectorAll('[data-edit-details]')) button.addEventListener('click', () => {
  if (!busy && !paid && !awaitingVerification) showDetailsStage();
});
let signingInProgress = false;
const signatureAnimation = createSignatureAnimation({
  svg:document.getElementById('signature-writing'),
  stage:document.getElementById('signature-animation-stage'),
  penLayer:document.getElementById('signing-pen-layer'),
  penImage:document.getElementById('signing-pen'),
  status:document.getElementById('signature-animation-status')
});
function updateAgreementRequirements() {
  const hasSignature = signatureInput.value.trim().length > 0;
  signatureInput.setCustomValidity(hasSignature ? '' : 'Please type your full name.');
  signAgreementButton.disabled = signingInProgress || !clientDetails || !(agreementConsent.checked && hasSignature && signatureInput.validity.valid && emailInput.value.trim() && emailInput.validity.valid);
}
agreementConsent.addEventListener('change', updateAgreementRequirements);
agreementConsent.addEventListener('change', () => {if (!agreementConsent.checked) signatureAnimation.clear();});
signatureInput.addEventListener('input', updateAgreementRequirements);
signatureInput.addEventListener('change', updateAgreementRequirements);
emailInput.addEventListener('input', updateAgreementRequirements);
emailInput.addEventListener('change', updateAgreementRequirements);
signatureInput.addEventListener('input', () => signatureAnimation.clear());
signatureInput.addEventListener('input', () => {signatureError.hidden=true;});
window.addEventListener('pageshow', updateAgreementRequirements);
function showAgreementStage(payment, fromDetails = false) {
  invitationStage.hidden = true;
  paymentErrorStage.hidden = true;
  packageStage.hidden = true;
  confirmationStage.hidden = true;
  document.body.classList.toggle('is-payment-stage', payment);
  document.querySelector('.hero-title h1').textContent = payment ? 'Payment' : 'Client Agreement';
  document.querySelector('.hero-title p').textContent = payment ? 'Review your order and continue to secure checkout.' : 'Please review each term and sign the agreement.';
  document.querySelector('.skip-link').setAttribute('href', payment ? '#payment-stage' : '#main');
  document.title = payment ? 'Payment — Tootica' : 'Client Agreement — Tootica';
  termsStage.hidden = payment;
  paymentStage.hidden = !payment;
  navbarSearch.hidden = payment;
  detailsStage.hidden = true;
  updateProgress(payment ? 3 : 2);
  history.replaceState(null, '', payment ? '#payment' : '#agreement-form');
  if (payment) {
    paymentStage.focus({preventScroll:true});
    document.querySelector('.agreement-progress').scrollIntoView({behavior:'smooth',block:'start'});
  } else if (fromDetails) {
    termsStage.focus({preventScroll:true});
    document.querySelector('.agreement-progress').scrollIntoView({behavior:'smooth',block:'start'});
  } else {
    agreementConsent.focus({preventScroll:true});
    agreementForm.scrollIntoView({behavior:'smooth',block:'center'});
  }
}
agreementForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (signingInProgress) return;
  updateAgreementRequirements();
  if (!agreementForm.reportValidity() || signAgreementButton.disabled) return;
  const name = signatureInput.value.trim();
  signatureError.hidden=true;
  signingInProgress = true;
  agreementForm.setAttribute('aria-busy','true');
  agreementConsent.disabled = true;
  signatureInput.disabled = true;
  emailInput.disabled = true;
  signAgreementButton.textContent = 'Signing…';
  updateAgreementRequirements();
  try {
    const finished = await signatureAnimation.play(name);
    if (!finished) {
      signatureError.textContent=document.getElementById('signature-animation-status').textContent || 'Please try signing again.';
      signatureError.hidden=false;
      return;
    }
    signAgreementButton.textContent = 'Continuing…';
    paymentPreloader.hidden = false;
    siteShell.inert = true;
    paymentPreloader.focus({preventScroll:true});
    const ready = await waitForPaymentTransition();
    if (!ready) return;
    paymentPreloader.hidden = true;
    siteShell.inert = false;
    showAgreementStage(true);
  } catch {
    signatureError.textContent='Please try signing again.';
    signatureError.hidden=false;
  } finally {
    paymentPreloader.hidden = true;
    siteShell.inert = false;
    signingInProgress = false;
    agreementConsent.disabled = false;
    signatureInput.disabled = false;
    emailInput.disabled = false;
    signAgreementButton.textContent = 'Sign Agreement';
    agreementForm.setAttribute('aria-busy','false');
    updateAgreementRequirements();
  }
});
window.addEventListener('pagehide', () => {signatureAnimation.cancel();cancelPaymentTransition?.();paymentPreloader.hidden = true;siteShell.inert = false;});

const paymentButton = document.getElementById('pay-now-button');
const paymentBackButton = document.getElementById('payment-back-button');
const paymentErrorRetry = document.getElementById('payment-error-retry');
const paymentErrorAgreement = document.getElementById('payment-error-agreement');
const paymentStatus = document.getElementById('payment-status');
let paymentConfig;
let paymentScriptPromise;
let activeOrder;
let attemptKey;
let attemptSignature;
let busy = false;
let paid = false;
let awaitingVerification = false;
let confirmedPayment = null;
let emailPollTimer = null;
let emailPollAttempts = 0;
let emailStatusBusy = false;
const emailStatusButton = document.getElementById('check-email-status');

function renderConfirmationEmail(result) {
  confirmedPayment = result;
  const state = confirmationEmailState(result.emailDelivery);
  document.getElementById('confirmation-email-heading').textContent = state.title;
  document.getElementById('confirmation-email-message').textContent = state.message;
  document.getElementById('confirmation-email').textContent = result.customerEmail || '';
  document.getElementById('confirmation-email-hint').textContent = state.hint;
  document.getElementById('confirmation-email-badge').textContent = state.badge;
  document.getElementById('confirmation-email-panel').classList.toggle('is-sent', result.emailDelivery === 'sent');
  emailStatusButton.hidden = !state.canCheck;
  clearTimeout(emailPollTimer);
  if (result.emailDelivery === 'pending' && emailPollAttempts < 6) emailPollTimer = setTimeout(() => {void refreshConfirmationEmail();}, 5000);
}
async function refreshConfirmationEmail() {
  if (!paid || emailStatusBusy || !activeOrder) return;
  clearTimeout(emailPollTimer);
  emailStatusBusy = true;
  emailPollAttempts++;
  emailStatusButton.disabled = true;
  emailStatusButton.textContent = 'Checking...';
  emailStatusButton.setAttribute('aria-busy','true');
  const notice = document.getElementById('confirmation-refresh-status');
  try {
    const result = await requestPayment(paymentConfig, '/orders/' + encodeURIComponent(activeOrder.orderId));
    if (!isConfirmedPayment(result, activeOrder)) throw new Error('Confirmation unavailable');
    notice.textContent = '';
    renderConfirmationEmail(result);
  } catch {
    notice.textContent = 'We could not refresh the email status. Your payment is confirmed and your invoice is ready to download.';
  } finally {
    emailStatusBusy = false;
    emailStatusButton.disabled = false;
    emailStatusButton.textContent = 'Check email status';
    emailStatusButton.setAttribute('aria-busy','false');
  }
}
emailStatusButton.addEventListener('click', () => {void refreshConfirmationEmail();});
window.addEventListener('pagehide', () => clearTimeout(emailPollTimer));
window.addEventListener('pageshow', () => {if (paid && confirmedPayment?.emailDelivery === 'pending') renderConfirmationEmail(confirmedPayment);});

function updatePaymentStatus(message, isError = false) {
  paymentStatus.textContent = message;
  paymentStatus.classList.toggle('is-error', isError);
  if (!paymentErrorStage.hidden) document.getElementById('payment-error-message').textContent = message;
}
function showPaymentError(title, message) {
  if (paid) return;
  detailsStage.hidden = true; packageStage.hidden = true; termsStage.hidden = true;
  paymentStage.hidden = true; confirmationStage.hidden = true; navbarSearch.hidden = true;
  paymentErrorStage.hidden = false;
  document.body.classList.add('is-payment-stage');
  document.getElementById('payment-error-heading').textContent = title;
  updatePaymentStatus(message, true);
  const reference = activeOrder?.reference || document.getElementById('payment-reference').textContent;
  document.getElementById('payment-error-reference').textContent = reference ? 'Invoice reference: ' + reference : '';
  document.querySelector('.hero-title h1').textContent = 'Payment incomplete';
  document.querySelector('.hero-title p').textContent = 'Your registration details have been kept.';
  document.title = title + ' - Tootica';
  document.querySelector('.skip-link').setAttribute('href', '#payment-error-stage');
  updateProgress(3);
  history.replaceState(null, '', '#payment-error');
  setPaymentBusy(false);
  paymentErrorStage.focus({preventScroll:true});
  document.querySelector('.agreement-progress').scrollIntoView({behavior:'smooth',block:'start'});
}
function paymentPendingMessage(result) {
  if (result.reason === 'authorized') return 'Your payment has been authorised and is awaiting final confirmation. Please do not pay again; check its status shortly.';
  if (result.reason === 'refunded' || result.status === 'review') return 'This payment needs a billing review. Please contact Tootica with your invoice reference before paying again.';
  return 'Payment is still awaiting confirmation. Please check again or contact Tootica with your invoice reference.';
}
function setPaymentBusy(value) {
  busy = value;
  paymentButton.disabled = value || paid || !paymentConfig?.enabled;
  paymentBackButton.disabled = value || paid || awaitingVerification;
  document.querySelectorAll('[data-edit-details]').forEach(button => {button.disabled = value || paid || awaitingVerification; button.textContent = detailsLocked ? 'View details' : 'Edit details';});
  paymentStage.setAttribute('aria-busy', String(value));
  paymentErrorStage.setAttribute('aria-busy', String(value));
  paymentErrorRetry.disabled = value || paid || !paymentConfig?.enabled;
  paymentErrorRetry.textContent = value ? 'Please wait...' : awaitingVerification ? 'Check payment status' : 'Try again';
  paymentErrorAgreement.disabled = value || paid;
  paymentButton.textContent = paid ? 'Payment confirmed' : value ? 'Please wait...' : awaitingVerification ? 'Check payment status' : 'Pay Now';
}
function renderOrder(order) {
  const formatter = new Intl.NumberFormat('en-IN', {style:'currency', currency:order.currency});
  document.getElementById('payment-amount').textContent = formatter.format(order.amount / 10 ** formatter.resolvedOptions().maximumFractionDigits);
  document.getElementById('payment-reference').textContent = order.reference;
  document.getElementById('essential-price').textContent = formatter.format(order.amount / 10 ** formatter.resolvedOptions().maximumFractionDigits);
}
function ensurePaymentScript() {
  if (window.Razorpay) return Promise.resolve();
  if (!paymentScriptPromise) {
    paymentScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => fail(), 15000);
      function fail() {clearTimeout(timer); script.remove(); paymentScriptPromise = null; reject(new Error('Checkout could not load.'));}
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => {clearTimeout(timer); if (window.Razorpay) resolve(); else fail();};
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  return paymentScriptPromise;
}
function confirmPayment(result) {
  if (!isConfirmedPayment(result, activeOrder)) return false;
  paymentErrorStage.hidden = true;
  paid = true;
  document.body.classList.add('is-payment-stage');
  awaitingVerification = false;
  renderConfirmationEmail(result);
  const formatter = new Intl.NumberFormat('en-IN', {style:'currency',currency:result.currency});
  document.getElementById('confirmation-amount').textContent = formatter.format(result.amount / 10 ** formatter.resolvedOptions().maximumFractionDigits);
  document.getElementById('confirmation-invoice-reference').textContent = result.reference || activeOrder.reference;
  document.getElementById('confirmation-payment-reference').textContent = result.paymentId;
  document.getElementById('confirmation-package').textContent = result.packageName || 'Registration';
  document.getElementById('confirmation-period-row').hidden = result.billingPeriod !== 'year';
  document.getElementById('download-invoice').hidden = false;
  paymentStage.hidden = true;
  termsStage.hidden = true;
  detailsStage.hidden = true;
  packageStage.hidden = true;
  navbarSearch.hidden = true;
  confirmationStage.hidden = false;
  document.querySelector('.skip-link').setAttribute('href','#confirmation-stage');
  document.querySelector('.hero-title h1').textContent = 'Registration complete';
  document.querySelector('.hero-title p').textContent = 'Thank you for choosing Tootica.';
  document.title = 'Registration complete — Tootica';
  updateProgress(4);
  history.replaceState(null, '', '#complete');
  confirmationStage.focus({preventScroll:true});
  document.querySelector('.agreement-progress').scrollIntoView({behavior:'smooth',block:'start'});
  setPaymentBusy(false);
  return true;
}
async function verifyPayment(response) {
  awaitingVerification = true;
  setPaymentBusy(true);
  updatePaymentStatus('Confirming your payment. Please keep this page open.');
  try {
    const result = await requestPayment(paymentConfig, '/verify', {orderId:activeOrder.orderId, ...response});
    if (!confirmPayment(result)) showPaymentError('Payment awaiting confirmation', paymentPendingMessage(result));
  } catch (error) {
    showPaymentError('Payment awaiting confirmation', error.status ? error.message + ' Check payment status before paying again.' : 'We could not confirm payment yet. Check its status before paying again.');
  } finally {setPaymentBusy(false);}
}
async function openGatewayCheckout() {
  if (busy || paid || !paymentConfig?.enabled) return;
  if (!clientDetails || !agreementConsent.checked || !signatureInput.value.trim() || !emailInput.value.trim() || !emailInput.validity.valid) {showAgreementStage(false); return;}
  setPaymentBusy(true);
  try {
    if (awaitingVerification) {
      const result = await requestPayment(paymentConfig, '/orders/' + encodeURIComponent(activeOrder.orderId));
      if (!confirmPayment(result)) {
        if (result.orderId === activeOrder.orderId && ['unpaid', 'failed', 'cancelled'].includes(result.status) && result.retryAllowed === true) {
          awaitingVerification = false;
          updatePaymentStatus(result.reason === 'checkout_incomplete' ? 'Checkout was not completed. Select Pay Now to continue with the same invoice.' : 'No completed payment was found. You can try checkout again.');
        } else updatePaymentStatus(paymentPendingMessage(result));
      }
      setPaymentBusy(false);
      return;
    }
    const name = signatureInput.value.trim();
    const email = emailInput.value.trim();
    const contact = JSON.stringify([name,email,clientDetails,selectedPackage]);
    if (!attemptKey || attemptSignature !== contact) {
      attemptKey = crypto.randomUUID();
      attemptSignature = contact;
      activeOrder = null;
    }
    updatePaymentStatus('Preparing your order...');
    // The server owns the invoice, amount, currency and durable acceptance record.
    // Reuse the idempotent order, but refresh its public key after a server-side key rotation.
    activeOrder = validateOrder(await requestPayment(paymentConfig, '/orders', {
      email, clientDetails, packageId:selectedPackage,
      agreement: {accepted:true, signerName:name, version:paymentConfig.agreementVersion}
    }, attemptKey), paymentConfig.environment);
    populateClientDetails(clientDetails, true);
    renderOrder(activeOrder);
    // Recover captured/pending payments across tabs and reloads before reopening checkout.
    const existing = await requestPayment(paymentConfig, '/orders/' + encodeURIComponent(activeOrder.orderId));
    if (confirmPayment(existing)) return;
    if (existing.status !== 'unpaid' || existing.retryAllowed !== true || existing.orderId !== activeOrder.orderId) {
      awaitingVerification = true;
      updatePaymentStatus(paymentPendingMessage(existing));
      return;
    }
    await ensurePaymentScript();
    const checkout = new window.Razorpay({
      key:activeOrder.keyId, order_id:activeOrder.orderId,
      amount:activeOrder.amount, currency:activeOrder.currency,
      name:paymentConfig.merchantName, description:paymentConfig.description, image:paymentConfig.logo,
      prefill:{name,email:activeOrder.customerEmail || email,contact:clientDetails.phone}, theme:{color:'#0F71D6'},
      handler:verifyPayment,
      modal:{ondismiss:() => {
        // Dismissal can race a successful callback; query the server before another attempt.
        if (paid || awaitingVerification) return;
        awaitingVerification = true;
        showPaymentError('Payment cancelled', 'Checkout was closed before payment was confirmed. Check payment status before trying again.');
      }}
    });
    checkout.on('payment.failed', () => {
      if (paid) return;
      awaitingVerification = true;
      showPaymentError('Payment unsuccessful', 'Your payment attempt was unsuccessful. Check payment status before trying again. If money was debited, contact Tootica with your invoice reference.');
      checkout.close();
    });
    checkout.open();
    updatePaymentStatus('Complete your payment in secure checkout.');
    // Remain busy for the entire modal lifetime.
    return;
  } catch (error) {
    showPaymentError('Unable to complete payment', error.status ? error.message : 'Checkout is unavailable. Please try again or contact Tootica. No payment has been confirmed.');
    setPaymentBusy(false);
  } finally {
    if (awaitingVerification || paid) setPaymentBusy(false);
  }
}
paymentButton.addEventListener('click', openGatewayCheckout);
paymentBackButton.addEventListener('click', () => {
  if (!busy && !paid && !awaitingVerification) showPaymentError('Payment cancelled', 'You went back before completing payment. Your details and agreement have been kept. You can return to checkout when you are ready.');
});
paymentErrorRetry.addEventListener('click', () => {
  if (busy || paid) return;
  if (!awaitingVerification) showAgreementStage(true);
  void openGatewayCheckout();
});
paymentErrorAgreement.addEventListener('click', () => {
  if (!busy && !paid) showAgreementStage(false);
});
async function initializePayments() {
  try {
    const response = await fetch('./payment-config.json', {cache:'no-store', signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('Settings unavailable');
    paymentConfig = validateConfig(await response.json());
    if (invoiceToken) await requestPayment(paymentConfig, '/session', {token:invoiceToken});
    if (!paymentConfig.enabled) {
      if(paymentConfig.invitationRequired) showInvitationNotice('Open your invitation link to register. Registration is currently unavailable; please contact Tootica.');
      else detailsForm.inert=false;
      updatePaymentStatus('Online payments are not available yet. Please contact Tootica for payment instructions.');
    } else {
      if (!invoiceToken) {
        const startSession = () => requestPayment(paymentConfig, '/session', invitationToken ? {invitationToken} : {});
        // Serialize first visits in cooperating tabs so they share the HttpOnly session.
        if (navigator.locks?.request) await navigator.locks.request('tootica-registration-session', startSession);
        else await startSession();
      }
      const summary = await requestPayment(paymentConfig, '/summary');
      invitationToken=null;
      invitedEmail=summary.invitedEmail || '';
      if(invitedEmail) {emailInput.value=invitedEmail;emailInput.readOnly=true;document.getElementById('client-contact').value=summary.invitedName || '';}
      detailsForm.inert=false;agreementForm.inert=false;
      if (!Number.isSafeInteger(summary.amount) || summary.amount <= 0 || !/^[A-Z]{3}$/.test(summary.currency) || typeof summary.reference !== 'string') throw new Error('Invalid invoice');
      renderOrder(summary);
      if (availablePackage(summary.packageId)) selectedPackage=summary.packageId;
      if (summary.clientDetails) {populateClientDetails(summary.clientDetails, summary.detailsLocked); updateAgreementRequirements();}
      if (summary.payment && summary.order) {
        activeOrder = validateOrder(summary.order, paymentConfig.environment);
        confirmPayment(summary.payment);
      }
      updatePaymentStatus(paymentConfig.environment === 'test' ? 'Test checkout — no live payment will be collected.' : 'Review your invoice, then continue to secure checkout.');
    }
  } catch (error) {
    if(paymentConfig?.invitationRequired || invitationToken) showInvitationNotice(error.status ? error.message : 'Your invitation could not be checked. Reload this page or contact Tootica.');
    paymentConfig = null;
    updatePaymentStatus(error.status ? error.message : 'Online payments are temporarily unavailable. Please reload this page or contact Tootica for help.', true);
  }
  setPaymentBusy(false);
}
initializePayments();
updateAgreementRequirements();
