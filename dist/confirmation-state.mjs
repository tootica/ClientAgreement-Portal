export function confirmationEmailState(status) {
  const states = {
    sent:{title:'Check your inbox',message:'Your payment confirmation and paid invoice have been sent to',hint:'If you do not see the email, check your spam or junk folder.',badge:'Sent',canCheck:false},
    pending:{title:'We’re preparing your email',message:'Your payment confirmation and paid invoice are queued for',hint:'Your payment is complete. You can download your invoice below while we send the email.',badge:'Preparing',canCheck:true},
    review:{title:'Your invoice is ready to download',message:'We could not confirm email delivery to',hint:'Keep a copy below. Contact Tootica with your invoice reference if you need help with the email.',badge:'Needs follow-up',canCheck:true},
    disabled:{title:'Your invoice is ready to download',message:'Your registered email address is',hint:'Email delivery is not available yet. Download your paid invoice below, or contact Tootica for an emailed copy.',badge:'PDF ready',canCheck:false},
    missing:{title:'Your invoice is ready to download',message:'Your payment has been confirmed.',hint:'Download your paid invoice below. Contact Tootica to add an email address for your records.',badge:'PDF ready',canCheck:false}
  };
  return states[status] || states.review;
}
