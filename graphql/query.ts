import { gql } from "@apollo/client";

export const GET_LISTINGS = gql`
  query getListings($hashes: [String]) {
    listings(transactionHashes: $hashes) {
      id
      ethscriptionHash
      salt
      sellerAddress
      price
      startTime
      endTime
    }
  }
`;
