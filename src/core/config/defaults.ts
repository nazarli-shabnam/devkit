import type { Database } from '../../types/config';

/** Default host/container ports for databases that run as containers. */
export const DB_DEFAULT_PORTS: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  mariadb: 3306,
  mongodb: 27017,
  redis: 6379,
};

/** The port a database is published on: the configured one, else its type's default (none for sqlite). */
export function effectiveDbPort(db: Pick<Database, 'type' | 'port'>): number | undefined {
  return db.port ?? DB_DEFAULT_PORTS[db.type];
}
