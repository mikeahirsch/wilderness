export const getWalletColor = (address: string) => {
  // Hash the wallet address to a number between 0 and 360
  const rawAddress = address.slice(2);
  const hue = parseInt(rawAddress, 16) % 360;
  return `hsl(${hue}, 50%, 50%)`;
};
