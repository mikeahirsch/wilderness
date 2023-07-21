export const ethAddressToColor = (address: string) => {
  const rawAddress = address.slice(2);
  const colorCode = rawAddress.slice(0, 6);
  return "#" + colorCode;
};
