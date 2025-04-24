wget "https://raw.githubusercontent.com/TowoLabs/ftso-signal-providers/next/bifrost-wallet.providerlist.json"
mkdir -p providers-names
rm -f providers-names/bifrost-wallet.providerlist.json
mv bifrost-wallet.providerlist.json providers-names/bifrost-wallet.providerlist.json