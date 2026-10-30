import {loadConfig} from '../../server/config.mjs';
import {createSheetsApp} from '../../server/sheets-app.mjs';
export default async (request, context) => {
  try {return await createSheetsApp({config:loadConfig()}).handle(request,{ip:context?.ip || 'unknown'});}
  catch {return Response.json({error:'Payment service is not configured. Please contact support@tootica.com.'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
export const config={path:['/api/payments/*','/payment-config.json'],preferStatic:false};
