import 'reflect-metadata';
import {singleton as Injectable, container as Container} from 'tsyringe';

export function make<T>(serviceClass: {new (...args: any[]): T}): T {
  return Container.resolve(serviceClass);
}

export {Injectable, Container};

