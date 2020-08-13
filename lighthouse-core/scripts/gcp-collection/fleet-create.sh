#!/bin/bash

set -euxo pipefail

##
# @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
# Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
##

DIRNAME="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LH_ROOT="$DIRNAME/../../.."
cd $DIRNAME

node fleet-create-directories.js $@

cd "$LH_ROOT/.tmp/gcp-instances"

for instance in $(ls)
do
  cd "$instance"
  bash run.sh "$instance" &
  cd ..
done

wait
