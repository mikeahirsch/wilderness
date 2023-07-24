import sha256 from "crypto-js/sha256";

export interface Ethscription {
  block_confirmations: number;
  content_taken_down_at: null | string;
  content_uri: string;
  creation_timestamp: string;
  creator: string;
  current_owner: string;
  ethscription_number: number;
  image_removed_by_request_of_rights_holder: boolean;
  mimetype: string;
  min_block_confirmations: number;
  overall_order_number_as_int: string;
  previous_owner: null | string;
  transaction_hash: string;
  transaction_index: number;
  valid_data_uri: boolean;
}

export interface FetchResponse {
  ethscriptions: Ethscription[];
}

export interface Plot {
  x: number;
  y: number;
}

export interface FetchRequest {
  x: number;
  y: number;
  resolve: (value: Ethscription | null) => void;
  reject: (reason?: any) => void;
  subscribers: Subscriber[];
}

export interface Subscriber {
  callback: (ethscription: Ethscription | null) => void;
  count: number;
}

export interface EthscriptionCacheItem {
  ethscription: Ethscription | null;
  timestamp: number;
  subscribers: Subscriber[];
  fetchPromise?: Promise<Ethscription | null> | null;
}

export type Unsubscribe = () => void;

export const fetchQueue: FetchRequest[] = [];
export const ethscriptionCache: { [key: string]: EthscriptionCacheItem } = {};
export const cacheLifetime = 5 * 60 * 1000; // Cache items expire after 5 minutes

export const getEthscriptionCache = (x: number, y: number) => {
  const hash = sha256(`data:,${x},${y}`).toString();
  const cachedResponse = ethscriptionCache[hash];
  return cachedResponse;
};

let fetchPromise: Promise<Ethscription[]> | null = null;

export const fetchEthscriptions = async (
  fetchRequests: {
    x: number;
    y: number;
    subscribers: Subscriber[];
  }[]
): Promise<Ethscription[]> => {
  // If a fetch is already in progress, return the existing promise
  if (fetchPromise) return fetchPromise;

  const plots = fetchRequests.map((request) => ({
    x: request.x,
    y: request.y,
  }));
  const subscribersList = fetchRequests.map(
    (request) => request.subscribers || []
  );
  const hashes = plots.map((plot) =>
    sha256(`data:,${plot.x},${plot.y}`).toString()
  );

  const hashesParam = encodeURIComponent(JSON.stringify(hashes));

  fetchPromise = fetch(
    `https://api.ethscriptions.com/api/ethscriptions/filtered?sha=${hashesParam}`
  )
    .then(async (response) => {
      const json: FetchResponse = await response.json();

      hashes.forEach((hash, index) => {
        const ethscription =
          json.ethscriptions.find(
            (ethscription) =>
              sha256(ethscription.content_uri).toString() === hash
          ) ?? null;

        let cachedResponse = ethscriptionCache[hash];
        if (!cachedResponse) {
          cachedResponse = ethscriptionCache[hash] = {
            ethscription: null,
            timestamp: Date.now(),
            subscribers: subscribersList[index] || [],
            fetchPromise: null,
          };
        }

        cachedResponse.ethscription = ethscription;
        cachedResponse.timestamp = Date.now();
        cachedResponse.fetchPromise = null;

        cachedResponse.subscribers.forEach((subscriber) =>
          subscriber.callback(cachedResponse.ethscription)
        );
      });

      // Once the fetch is complete, clear the fetchPromise
      fetchPromise = null;

      return json.ethscriptions;
    })
    .catch((error) => {
      // In case of error, also clear the fetchPromise
      fetchPromise = null;
      throw error;
    });

  return fetchPromise!;
};

export const unsubscribeToEthscription = (
  x: number,
  y: number,
  callback: (ethscription: Ethscription | null) => void
) => {
  const hash = sha256(`data:,${x},${y}`).toString();

  if (ethscriptionCache[hash]) {
    const existingSubscriberIndex = ethscriptionCache[
      hash
    ].subscribers.findIndex((subscriber) => subscriber.callback === callback);

    if (existingSubscriberIndex !== -1) {
      ethscriptionCache[hash].subscribers[existingSubscriberIndex].count--;

      if (
        ethscriptionCache[hash].subscribers[existingSubscriberIndex].count === 0
      ) {
        ethscriptionCache[hash].subscribers.splice(existingSubscriberIndex, 1);
      }
    }
  }
};

export const subscribeToEthscription = (
  x: number,
  y: number,
  callback: (ethscription: Ethscription | null) => void
): Unsubscribe => {
  const hash = sha256(`data:,${x},${y}`).toString();
  if (!ethscriptionCache[hash]) {
    const subscriber: Subscriber = { callback, count: 1 };
    fetchEthscriptions([{ x, y, subscribers: [subscriber] }])
      .then((ethscriptions) => {
        const matchingEthscription =
          ethscriptions?.find(
            (ethscription) =>
              sha256(`data:,${x},${y}`).toString() ===
              sha256(ethscription.content_uri).toString()
          ) ?? null;
        ethscriptionCache[hash] = {
          ethscription: matchingEthscription,
          timestamp: Date.now(),
          subscribers: [subscriber],
        };
        callback(matchingEthscription);
      })
      .catch((error) => {
        console.log(error);
      });
  } else {
    const existingSubscriberIndex = ethscriptionCache[
      hash
    ].subscribers.findIndex((subscriber) => subscriber.callback === callback);

    if (existingSubscriberIndex === -1) {
      const subscriber: Subscriber = { callback, count: 1 };
      ethscriptionCache[hash].subscribers.push(subscriber);
    } else {
      ethscriptionCache[hash].subscribers[existingSubscriberIndex].count++;
    }

    callback(ethscriptionCache[hash].ethscription);
  }

  return () => unsubscribeToEthscription(x, y, callback);
};
