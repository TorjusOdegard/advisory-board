/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // discord.js pulls native zlib-sync; keep these on the Node runtime, not the bundler graph
  serverExternalPackages: [
    "@chat-adapter/discord",
    "discord.js",
    "@discordjs/ws",
    "@discordjs/rest",
    "zlib-sync",
  ],
}

export default nextConfig
