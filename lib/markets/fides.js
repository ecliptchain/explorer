const fetch = require('node-fetch');

const base_url = 'https://node1.fides-ex.com';

async function fetchData(url)
{
	try
	{
		const response = await fetch(url);
		if (!response.ok)
		{
			throw new Error(`HTTP Error: ${response.status}`);
		}
		const body = await response.json();
		if (body.error)
		{
			throw new Error(body.error || 'Unknown API error');
		}
		return body.data;
	}
	catch (error)
	{
		console.error(`Error fetching data from ${url}:`, error.message);
		return null;
	}
}

async function get_summary(coin, exchange)
{
	const url = `${base_url}/market/get-market-summary/${exchange.toUpperCase()}_${coin.toUpperCase()}`;
	const body = await fetchData(url);
	if (!body)
	{
		return {error: `Pair not found: ${coin}-${exchange}`};
	}

	return {
		ask: parseFloat(body.LowestAsk).toFixed(8),
		bid: parseFloat(body.HeighestBid).toFixed(8),
		volume: parseFloat(body.QuoteVolume).toFixed(8),
		volume_btc: parseFloat(body.BaseVolume).toFixed(8),
		high: parseFloat(body.High_24hr).toFixed(8),
		low: parseFloat(body.Low_24hr).toFixed(8),
		last: parseFloat(body.Last).toFixed(8),
		change: parseFloat(body.PercentChange)
	};
}

async function get_trades(coin, exchange)
{
	const url = `${base_url}/market/get-trade-history/${exchange.toUpperCase()}_${coin.toUpperCase()}`;
	const body = await fetchData(url);
	if (!body)
	{
		return {error: `No trade history found for ${coin}-${exchange}`};
	}

	return body.map(trade => ({
		MarketType: trade.MarketType,
		CurrencyType: trade.CurrencyType,
		Type: trade.Type,
		Pair: trade.Pair,
		Rate: parseFloat(trade.Rate).toFixed(8),
		Volume: parseFloat(trade.Volume).toFixed(8),
		Total: (parseFloat(trade.Rate) * parseFloat(trade.Volume)).toFixed(8)
	}));
}

async function get_orders_side(coin, exchange, side)
{
	const url = `${base_url}/market/get-open-orders/${exchange.toUpperCase()}_${coin.toUpperCase()}/${side.toUpperCase()}/10`;
	console.log(`Fetching ${side} orders from: ${url}`);

	const body = await fetchData(url);
	if (!body || !body.Orders)
	{
		return [];
	}

	return body.Orders.map(order => ({
		MarketType: order.MarketType,
		CurrencyType: order.CurrencyType,
		Type: body.Type,
		Pair: body.Pair,
		Rate: parseFloat(order.Rate).toFixed(8),
		Volume: parseFloat(order.Volume).toFixed(8),
		Total: (parseFloat(order.Rate) * parseFloat(order.Volume)).toFixed(8)
	}));
}

async function get_orders(coin, exchange)
{
	const [buys, sells] = await Promise.all([
		get_orders_side(coin, exchange, "buy"),
		get_orders_side(coin, exchange, "sell")
	]);

	return {buys, sells};
}

module.exports = {
	get_data: async function (settings, cb)
	{
		try
		{
			const [orders, trades, summary] = await Promise.all([
				get_orders(settings.coin, settings.exchange),
				get_trades(settings.coin, settings.exchange),
				get_summary(settings.coin, settings.exchange)
			]);

			return cb(null, {
				buys: orders.buys,
				sells: orders.sells,
				chartdata: [],
				trades,
				stats: summary
			});
		}
		catch (error)
		{
			console.error("Error in get_data:", error);
			return cb(error, null);
		}
	}
};
