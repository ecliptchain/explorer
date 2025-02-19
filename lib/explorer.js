const fetch = require('node-fetch'); // Use node-fetch for API requests
const settings = require('./settings');
const Address = require('../models/address');
const Client = require('bitcoin-core');

const client = new Client(settings.wallet);
const base_url = `http://127.0.0.1:${settings.port}/api/`;

// Returns coinbase total sent as current coin supply
async function coinbase_supply()
{
	try
	{
		const address = await Address.findOne({a_id: 'coinbase'});
		return address ? address.sent : 0;
	}
	catch (err)
	{
		console.error("Error fetching coinbase supply:", err);
		return 0;
	}
}

// Executes an RPC command with error handling
async function rpcCommand(method, parameters = [])
{
	try
	{
		const response = await client.command([{method, parameters}]);
		if (response[0]?.name === 'RpcError')
		{
			console.error(`RPC Error in ${method}:`, response[0]);
			return 'There was an error. Check your console.';
		}
		return response[0];
	}
	catch (err)
	{
		console.error(`Error in RPC command ${method}:`, err);
		return 'There was an error. Check your console.';
	}
}

module.exports = {
	convert_to_satoshi: (amount) =>
	{
		return parseInt(amount.toFixed(8).replace('.', ''), 10);
	},

	get_hashrate: async function ()
	{
		if (!settings.index.show_hashrate)
		{
			return '-';
		}

		let response;
		if (settings.use_rpc)
		{
			const method = settings.nethash === 'netmhashps' ? 'getmininginfo' : 'getnetworkhashps';
			response = await rpcCommand(method);
		}
		else
		{
			const url = base_url + (settings.nethash === 'netmhashps' ? 'getmininginfo' : 'getnetworkhashps');
			response = await fetch(url).then(res => res.json()).catch(err => console.error(err));
		}

		if (!response || response === 'There was an error. Check your console.')
		{
			return '-';
		}

		let hashRate = parseFloat(settings.nethash === 'netmhashps' ? response.netmhashps : response);
		const units = settings.nethash_units || 'H';

		switch (units)
		{
			case 'K':
				return (hashRate * 1000).toFixed(4);
			case 'M':
				return (hashRate / 1e6).toFixed(4);
			case 'G':
				return (hashRate / 1e9).toFixed(4);
			case 'T':
				return (hashRate / 1e12).toFixed(4);
			case 'P':
				return (hashRate / 1e15).toFixed(4);
			default:
				return hashRate.toFixed(4);
		}
	},

	get_difficulty: async function ()
	{
		return settings.use_rpc ? rpcCommand('getdifficulty') : fetch(base_url + 'getdifficulty').then(res => res.json());
	},

	get_connectioncount: async function ()
	{
		return settings.use_rpc ? rpcCommand('getconnectioncount') : fetch(base_url + 'getconnectioncount').then(res => res.json());
	},

	get_blockcount: async function ()
	{
		return settings.use_rpc ? rpcCommand('getblockcount') : fetch(base_url + 'getblockcount').then(res => res.json());
	},

	get_blockhash: async function (height)
	{
		return settings.use_rpc ? rpcCommand('getblockhash', [parseInt(height)]) : fetch(`${base_url}getblockhash?height=${height}`).then(res => res.json());
	},

	get_block: async function (hash)
	{
		return settings.use_rpc ? rpcCommand('getblock', [hash]) : fetch(`${base_url}getblock?hash=${hash}`).then(res => res.json());
	},

	get_rawtransaction: async function (hash)
	{
		return settings.use_rpc ? rpcCommand('getrawtransaction', [hash, 1]) : fetch(`${base_url}getrawtransaction?txid=${hash}&decrypt=1`).then(res => res.json());
	},

	get_supply: async function ()
	{
		if (!settings.use_rpc)
		{
			switch (settings.supply)
			{
				case 'HEAVY':
					return fetch(base_url + 'getsupply').then(res => res.json());
				case 'GETINFO':
					return fetch(base_url + 'getinfo').then(res => res.json()).then(data => data.moneysupply);
				case 'BALANCES':
					return this.balance_supply();
				case 'TXOUTSET':
					return fetch(base_url + 'gettxoutsetinfo').then(res => res.json()).then(data => data.total_amount);
				default:
					return coinbase_supply().then(supply => supply / 1e8);
			}
		}

		switch (settings.supply)
		{
			case 'HEAVY':
				return rpcCommand('getsupply');
			case 'GETINFO':
				return rpcCommand('getinfo').then(response => response.moneysupply);
			case 'BALANCES':
				return this.balance_supply();
			case 'TXOUTSET':
				return rpcCommand('gettxoutsetinfo').then(response => response.total_amount);
			default:
				return coinbase_supply().then(supply => supply / 1e8);
		}
	},

	balance_supply: async function ()
	{
		const addresses = await Address.find({balance: {$gt: 0}}, 'balance').exec();
		return addresses.reduce((sum, addr) => sum + addr.balance, 0) / 1e8;
	},

	is_unique: function (array, object)
	{
		const index = array.findIndex(item => item.addresses === object);
		return {unique: index === -1, index};
	},

	calculate_total: function (vout)
	{
		return vout.reduce((sum, output) => sum + output.amount, 0);
	},

	prepare_vout: async function (vout, txid, vin)
	{
		const arr_vout = [];
		const arr_vin = vin || [];

		for (let i = 0; i < vout.length; i++)
		{
			if (['nonstandard', 'nulldata'].includes(vout[i].scriptPubKey.type))
			{
				continue;
			}

			const address = vout[i].scriptPubKey.addresses?.[0];
			const amount = this.convert_to_satoshi(parseFloat(vout[i].value));

			const {unique, index} = this.is_unique(arr_vout, address);
			if (unique)
			{
				arr_vout.push({addresses: address, amount});
			}
			else
			{
				arr_vout[index].amount += amount;
			}
		}

		if (vout[0]?.scriptPubKey.type === 'nonstandard' && arr_vin.length && arr_vout.length && arr_vin[0].addresses === arr_vout[0].addresses)
		{
			arr_vout[0].amount -= arr_vin[0].amount;
			arr_vin.shift();
		}

		return {arr_vout, arr_vin};
	},

	prepare_vin: async function (tx)
	{
		const arr_vin = [];

		for (const vin of tx.vin)
		{
			const addresses = vin.coinbase ? [{
				hash: 'coinbase',
				amount: tx.vout.reduce((sum, v) => sum + v.value, 0)
			}] : await this.get_input_addresses(vin, tx.vout);
			if (!addresses || !addresses.length)
			{
				continue;
			}

			const {unique, index} = this.is_unique(arr_vin, addresses[0].hash);
			const amount = this.convert_to_satoshi(parseFloat(addresses[0].amount));

			if (unique)
			{
				arr_vin.push({addresses: addresses[0].hash, amount});
			}
			else
			{
				arr_vin[index].amount += amount;
			}
		}

		return arr_vin;
	}
};
