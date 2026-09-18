/** SQL expression for 00:00 today in IST as timestamptz. */
export const IST_DAY_START = `(date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')`
