-- schema fixture: exercises the whole mapping table
SET NAMES utf8mb4;
USE `shop`;

CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `active` boolean NOT NULL DEFAULT true,
  `bio` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE orders (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  user_id int unsigned NOT NULL,
  status enum('new','paid','shipped') NOT NULL DEFAULT 'new',
  tags set('a','b') DEFAULT NULL,
  total decimal(12,2) NOT NULL DEFAULT '0.00',
  meta json DEFAULT (json_object()),
  placed_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  loc point NOT NULL SRID 4326,
  cents bigint GENERATED ALWAYS AS ((`total` * 100)) STORED,
  serial_col serial,
  legacy varchar(40) BINARY DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_status_prefix (status, legacy(10) DESC) INVISIBLE,
  FULLTEXT KEY ft_legacy (legacy),
  SPATIAL KEY sp_loc (loc),
  CONSTRAINT fk_orders_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_orders_ghost FOREIGN KEY (user_id) REFERENCES ghost_table (id)
) ENGINE=InnoDB AUTO_INCREMENT=1000 DEFAULT CHARSET=utf8mb4 COMMENT='order''s';

ALTER TABLE orders ADD COLUMN note varchar(64) DEFAULT NULL;
ALTER TABLE orders ADD INDEX idx_note (note);
ALTER TABLE `orders` ADD CONSTRAINT fk_orders_users2 FOREIGN KEY (user_id) REFERENCES `users` (`id`);

INSERT INTO users VALUES (1, 'a@b.c', 1, NULL);
TOTALLY NOT SQL %%%;

-- logical: {"from":"orders.status","to":"users","cardinality":"m-1","label":"soft"}
-- logical: {"from":"orders","to":"nowhere","cardinality":"1-1"}
