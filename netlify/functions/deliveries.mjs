import {loadConfig} from '../../server/config.mjs';
import {createSheetsApp} from '../../server/sheets-app.mjs';
export default async () => {
  const delivered=await createSheetsApp({config:loadConfig()}).runDeliveries(1);
  return Response.json({delivered});
};
export const config={schedule:'*/15 * * * *'};
