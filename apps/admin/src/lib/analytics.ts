import "server-only";
import { db } from "./db";
import type { DateRange } from "./metrics";

const TZ = "Asia/Kolkata";

export async function getVisitorAnalytics(range: DateRange) {
  const sql = db();
  const start = sql`(${range.from}::date at time zone ${TZ})`;
  const end = sql`((${range.to}::date + 1) at time zone ${TZ})`;
  const inRange = sql`occurred_at >= ${start} and occurred_at < ${end}`;
  const bucket = range.bucket === "month" ? sql`'month'` : sql`'day'`;

  const [totals] = await sql<{ pageViews: number; anonViews: number; visitors: number; sessions: number; liveNow: number; productViews: number; purchases: number; revenue: number }[]>`
    select
      count(*) filter (where event = 'page_view')::int as "pageViews",
      count(*) filter (where event = 'page_view' and visitor_id is null)::int as "anonViews",
      count(distinct visitor_id)::int as visitors,
      count(distinct session_id)::int as sessions,
      (select count(distinct session_id) from shop.analytics_events where occurred_at > now() - interval '5 minutes')::int as "liveNow",
      count(*) filter (where event = 'product_view')::int as "productViews",
      count(distinct session_id) filter (where event = 'purchase')::int as purchases,
      coalesce(sum(value_paise) filter (where event = 'purchase'), 0)::bigint::float8 as revenue
    from shop.analytics_events where ${inRange}`;

  const [daily, pages, products, sources, devices, countries, funnel, searches] = await Promise.all([
    sql<{ bucket: string; visitors: number; pageViews: number }[]>`
      with b as (select generate_series(date_trunc(${bucket}, ${range.from}::date), ${range.to}::date, ('1 ' || ${bucket})::interval)::date as bucket),
      e as (select date_trunc(${bucket}, occurred_at at time zone ${TZ})::date as bucket, visitor_id, event from shop.analytics_events where ${inRange})
      select to_char(b.bucket, 'YYYY-MM-DD') as bucket,
             count(distinct e.visitor_id)::int as visitors,
             count(e.event) filter (where e.event = 'page_view')::int as "pageViews"
      from b left join e on e.bucket = b.bucket group by b.bucket order by b.bucket`,
    sql<{ path: string; views: number; visitors: number }[]>`
      select path, count(*)::int as views, count(distinct visitor_id)::int as visitors
      from shop.analytics_events where event = 'page_view' and ${inRange}
      group by path order by views desc limit 10`,
    sql<{ name: string | null; slug: string | null; views: number; addToCart: number }[]>`
      select p.name, p.slug,
             count(*) filter (where e.event = 'product_view')::int as views,
             count(*) filter (where e.event = 'add_to_cart')::int as "addToCart"
      from shop.analytics_events e left join shop.products p on p.id = e.product_id
      where e.product_id is not null and ${inRange}
      group by p.name, p.slug order by views desc limit 10`,
    sql<{ source: string; sessions: number }[]>`
      select coalesce(utm_source, referrer_host, 'Direct / none') as source, count(distinct coalesce(session_id::text, id::text))::int as sessions
      from shop.analytics_events where event = 'page_view' and ${inRange}
      group by 1 order by 2 desc limit 8`,
    sql<{ device: string; n: number }[]>`
      select coalesce(device, 'unknown') as device, count(*)::int as n
      from shop.analytics_events where event = 'page_view' and ${inRange} group by 1 order by 2 desc`,
    sql<{ country: string; n: number }[]>`
      select country, count(*)::int as n from shop.analytics_events
      where event = 'page_view' and country is not null and ${inRange} group by 1 order by 2 desc limit 8`,
    sql<{ step: string; sessions: number }[]>`
      select s.step, (select count(distinct session_id)::int from shop.analytics_events
                      where session_id is not null and ${inRange} and (s.event is null or event = s.event)) as sessions
      from (values (1, 'Visited', null), (2, 'Viewed a product', 'product_view'), (3, 'Added to cart', 'add_to_cart'),
                   (4, 'Started checkout', 'begin_checkout'), (5, 'Purchased', 'purchase')) as s(ord, step, event)
      order by s.ord`,
    sql<{ query: string; n: number }[]>`
      select lower(search_query) as query, count(*)::int as n from shop.analytics_events
      where event = 'search' and search_query is not null and ${inRange} group by 1 order by 2 desc limit 10`,
  ]);

  return { totals: totals!, daily, pages, products, sources, devices, countries, funnel, searches };
}
