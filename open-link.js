export function openInNewPage(url) {
  window.open(url, '_blank');
}
export function openNetworkConnectPage() {
  const width = 1260;
  const height = 750;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  window.open(
    "http://10.10.9.9",
    "连接到上大校园网",
    `width=${width},height=${height},left=${left},top=${top},
    menubar=no,toolbar=no,location=no,status=no,scrollbars=no`
  );
}