import { createServer } from 'node:http';

/** Anonymous, read-only protocol fixture; no credentials, customers or writes. */
export async function startPublicCatalogueFixture() {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET' && new URL(request.url, 'http://127.0.0.1').pathname === '/rest/v1/farm_catalog_prices') {
      response.end(JSON.stringify({ revision: '00000000-0000-4000-8000-000000000099', prices: { milk: 6200, paneer: 20000, ghee: 37500, bottle: 1000 } }));
    } else {
      response.writeHead(405); response.end(JSON.stringify({ message: 'Only anonymous catalogue reads are supported by this fixture.' }));
    }
  });
  await new Promise(resolve => server.listen(Number(process.env.HERO_CATALOGUE_PORT || 3199), '127.0.0.1', resolve));
  server.unref();
  return { server, env: { NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_hero_browser_fixture' } };
}
