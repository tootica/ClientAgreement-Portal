export const packages = Object.freeze([
  Object.freeze({id:'essential',name:'Essential',available:true,billingPeriod:'year'}),
  Object.freeze({id:'practice-plus',name:'Practice Plus',available:false})
]);
export const availablePackage = id => packages.find(plan => plan.id === id && plan.available) || null;
export const packageName = id => packages.find(plan => plan.id === id)?.name || '';
