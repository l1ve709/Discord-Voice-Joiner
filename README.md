## ⚠️Sorumluluk Reddi Beyanı⚠️

Bu proje, Discord’un kullanım koşulları ve politikalarını ihlal eden "selfbot" kullanımı içerir. Selfbot kullanımı Discord tarafından yasaklanmıştır ve bu tür bir kullanımdan doğacak herhangi bir hesap yasaklama veya ceza işleminden kesinlikle sorumlu değilim. Bu projeyi kullanmadan önce riskleri göz önünde bulundurun. Saygılarımla -Ediz

[Detaylı Resmi Bilgiler](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots)



# Discord Selfbot Voice Joiner

Discrod Kullanıcı Tokenlerinizi belirlediğiniz ses kanalına sokun!

## Kullanılan Dil(ler) ve Kütüphaneler

<picture>
  <source srcset="https://skillicons.dev/icons?i=js,nodejs" media="(prefers-color-scheme: dark)">
  <img src="https://skillicons.dev/icons?i=js,nodejs">
</picture>

## Özellikler

- Birden fazla token ile ses kanallarına otomatik katılım.
- Belirli tokenlere özel yayın durumu (streaming presence) ayarlama.
- Belirli sunucu ve ses kanalları için ayar yapılabilir.
- Her bir tokenin ses kanalı ID'si ayrı olarak ayarlanabilir.
- Katılım sırasında durum mesajları ile tokenlerin başarıyla giriş yapıp yapmadığını görebilirsiniz.

## Kurulum

1. Bu projeyi bilgisayarınıza klonlayın veya indirin.
2. Gerekli kütüphaneleri yükleyin
    ```bash
    npm install discord.js-selfbot-v13 @discordjs/voice
    ```

3. `config.js` dosyasını açın ve aşağıdaki bilgileri güncelleyin:
   - `TOKENS`: Discord hesap tokenlerini buraya ekleyin.
   - `guildId`: Tokenlerin katılacağı sunucunun ID'sini buraya yazın.
   - `channelIds`: Tokenlerin katılacağı ses kanallarının ID'lerini sırasıyla buraya ekleyin.

## Kullanım

Projeyi başlatmak için aşağıdaki komutu çalıştırınız:

```bash
node main.js
```

Başlatıldığında her bir kullanıcı tokeni belirttiğiniz sunucuya ve ses kanalına bağlanacaktır. Belirli tokenler için özel durumu ayarlanacaktır. (degistirilebilir)

## Yapılandırma

- `TOKENS`: Bu alana Discord tokenlerinizi ekleyin.
- `guildId`: Tüm tokenlerin bağlanacağı sunucunun ID'si.
- `channelIds`: Her bir tokenin bağlanacağı ses kanalının ID'si. Sıralama, `TOKENS` dizisine karşılık gelir.
- `voiceSettings`: Bu ayarlar şu an çalışmıyor ancak her bir token için ses durumu (mute/deaf) ayarlanabilir.  >>> **Çalışmıyor**

## Özel Durumlar

- İlk iki token, "l1ve709.com" ile `STREAMING` durumuna geçer. İsterseniz o kısımları silin
- Üçüncü token, özel bir "sen_belirli" durumu gösterir.

## İletişim

İletişim ve yardım için bana şuralardan ulaşabilirsiniz:

- Instagram: l1ve709
- Discord: l1ve709
- Web Sitesi: [l1ve709.com](https://www.l1ve709.com)

## Lisans Bilgileri

- MIT Lisansı altında korunmaktadır


## Discord Hesabım

![My Discord](https://lantern.rest/api/v1/users/794909914760871967?svg=1&theme=dark&borderRadius=2&hideActivity=1&hideStatus=0)
