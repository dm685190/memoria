import { Redis } from '@upstash/redis'

// Create a singleton Redis instance
let redisInstance: Redis | null = null

export function getRedis() {
  if (!redisInstance) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    
    if (!url || !token) {
      console.warn('Upstash Redis credentials not configured')
      return null
    }
    
    redisInstance = new Redis({ url, token })
  }
  
  return redisInstance
}

// Health check for Redis connection
export async function checkRedisHealth() {
  const redis = getRedis()
  if (!redis) {
    return { ok: false, error: 'Redis not configured' }
  }
  
  try {
    const pong = await redis.ping()
    return { ok: pong === 'PONG', error: null }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}