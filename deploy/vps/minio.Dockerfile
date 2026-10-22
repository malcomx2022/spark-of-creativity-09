# MinIO (serveur et client mc) compilé depuis les commits des releases épinglées.
# MinIO ne publie plus d'images ni de binaires accessibles anonymement : quay.io/minio/*
# et Docker Hub refusent le pull, dl.min.io répond 410. Le code source reste public.
# Mêmes versions qu'auparavant : le volume minio_data existant est repris tel quel.
# Les -ldflags reproduisent buildscripts/gen-ldflags.go : sans eux, le binaire se déclare
# « DEVELOPMENT.GOGET » (build non officiel) au lieu de sa release.
#   docker build -f minio.Dockerfile -t domicares-minio:RELEASE.2025-09-07T16-13-09Z .
#   docker build -f minio.Dockerfile --target mc -t domicares-minio-mc:RELEASE.2025-08-13T08-35-41Z .
FROM golang:1.24.7-alpine3.22 AS build-minio
ARG MINIO_RELEASE=RELEASE.2025-09-07T16-13-09Z
ARG MINIO_VERSION=2025-09-07T16:13:09Z
ARG MINIO_COMMIT=07c3a429bfed433e49018cb0f78a52145d4bedeb
RUN P=github.com/minio/minio/cmd && CGO_ENABLED=0 GOBIN=/out go install -trimpath \
      -ldflags "-s -w -X $P.Version=${MINIO_VERSION} -X $P.CopyrightYear=${MINIO_VERSION%%-*} -X $P.ReleaseTag=${MINIO_RELEASE} -X $P.CommitID=${MINIO_COMMIT} -X $P.ShortCommitID=$(echo ${MINIO_COMMIT} | cut -c1-12)" \
      github.com/minio/minio@${MINIO_COMMIT} \
 && /out/minio --version | grep -q "${MINIO_RELEASE}"

FROM golang:1.24.7-alpine3.22 AS build-mc
ARG MC_RELEASE=RELEASE.2025-08-13T08-35-41Z
ARG MC_VERSION=2025-08-13T08:35:41Z
ARG MC_COMMIT=7394ce0dd2a80935aded936b09fa12cbb3cb8096
RUN P=github.com/minio/mc/cmd && CGO_ENABLED=0 GOBIN=/out go install -trimpath \
      -ldflags "-s -w -X $P.Version=${MC_VERSION} -X $P.CopyrightYear=${MC_VERSION%%-*} -X $P.ReleaseTag=${MC_RELEASE} -X $P.CommitID=${MC_COMMIT} -X $P.ShortCommitID=$(echo ${MC_COMMIT} | cut -c1-12)" \
      github.com/minio/mc@${MC_COMMIT} \
 && /out/mc --version | grep -q "${MC_RELEASE}"

# Client mc (bascule.sh) : sh disponible pour --entrypoint sh.
FROM alpine:3.22 AS mc
RUN apk add --no-cache ca-certificates
COPY --from=build-mc /out/mc /usr/bin/mc
ENTRYPOINT ["mc"]

# Serveur (cible par défaut) : root comme l'image officielle, pour les droits du volume existant.
FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=build-minio /out/minio /usr/bin/minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data"]
