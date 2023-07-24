import { GET_LISTINGS } from "../graphql/query";
import { ApolloClient, InMemoryCache } from "@apollo/client";
import { createLink } from "apollo-absinthe-upload-link";

const httpLink = createLink({
  uri: "https://ethscriptions-marketplace-api-prod.fly.dev/api",
});

function createApolloClient() {
  return new ApolloClient({
    ssrMode: typeof window === undefined,
    cache: new InMemoryCache(),
    link: httpLink,
  });
}

const getClient = () => {
  return createApolloClient();
};

// -------------------- Listings ------------------------ //

const getListings = (hashes: string[]) => {
  const apolloClient = getClient();
  return apolloClient.query({ query: GET_LISTINGS, variables: { hashes } });
};

const client = {
  getListings,
};
export default client;
