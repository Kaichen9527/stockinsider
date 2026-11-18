#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <grp.h>
#include <linux/dm-ioctl.h>
#include <stdio.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <unistd.h>

static int query_version(int descriptor) {
  struct dm_ioctl request;
  memset(&request, 0, sizeof request);
  request.version[0] = DM_VERSION_MAJOR;
  request.version[1] = DM_VERSION_MINOR;
  request.version[2] = DM_VERSION_PATCHLEVEL;
  request.data_size = sizeof request;
  request.data_start = sizeof request;
  return ioctl(descriptor, DM_VERSION, &request);
}

int main(void) {
  int descriptor = open("/dev/mapper/control", O_RDONLY | O_CLOEXEC);
  if (descriptor < 0 || query_version(descriptor) < 0)
    return 2;
  pid_t worker = fork();
  if (worker < 0)
    return 3;
  if (worker == 0) {
    if (setgroups(0, NULL) || setgid(65534) || setuid(65534) || geteuid() != 65534)
      _exit(4);
    int result = query_version(descriptor);
    _exit(result == -1 && errno == EACCES ? 0 : 5);
  }
  int worker_status;
  if (waitpid(worker, &worker_status, 0) != worker || !WIFEXITED(worker_status) ||
      WEXITSTATUS(worker_status))
    return 6;
  close(descriptor);
  puts("{\"rootReadOnlyIoctlPassed\":true,\"inheritedReadOnlyFdAfterDropDenied\":\"EACCES\"}");
  return 0;
}
