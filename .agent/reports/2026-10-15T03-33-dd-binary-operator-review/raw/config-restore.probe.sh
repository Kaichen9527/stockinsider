set -eu
install(){ : > "${@: -1}"; }
writer_env_file=/tmp/dd-operator-review-o15/synthetic-writer.env
drop_in_file=/tmp/dd-operator-review-o15/synthetic-drop.conf
release_id=169aad1b6cfa747f78ae3464b614f43c0749d806
install -o root -g stockinsider -m 0640 /dev/null "$writer_env_file"
printf 'STOCKINSIDER_WRITER_RELEASE_ID=%s\n' "$release_id" > "$writer_env_file"
printf '[Service]\nEnvironmentFile=%s\n' "$writer_env_file" > "$drop_in_file"
