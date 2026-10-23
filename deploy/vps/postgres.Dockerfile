# PostgreSQL 16 : image officielle Alpine (la même qu'auparavant) + locales musl.
# Sans `locale -a` (paquet musl-locales), initdb n'importe aucune collation système et journalise
# « no usable system locales were found » ; avec, il importe fr_FR, en_US… (les 908 collations ICU
# restent disponibles). Effet à l'initdb seulement : un volume pg_data existant garde ses données
# et ses collations (SELECT pg_import_system_collations('pg_catalog') pour les ajouter).
#   docker build -f postgres.Dockerfile -t domicares-postgres:16-alpine-locales .
FROM postgres:16-alpine
RUN apk add --no-cache musl-locales musl-locales-lang
